"""Read-only EvoRTL paper scoring. Standard library only, also used by Pages.

This module never runs evaluators, edits attempts, or infers a test's group from
its name. A manifest fixes the denominator; unresolved evidence stays unresolved.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from collections import Counter
from collections import defaultdict
from pathlib import Path
from statistics import mean
from statistics import pstdev
from typing import Any

SCORING_VERSION = "evortl-paper-2026-10-28-v3"
GROUPS = ("structure", "core", "regression")
EXTRA_GROUPS = ("error",)


def scoring_group(name: str) -> str:
    """Functionality is a historical spelling of Core, never a fifth group."""
    group = name.lower()
    return "core" if group == "functionality" else group


def scoring_test(test: dict[str, Any]) -> dict[str, Any]:
    if test["group"].lower() == "functionality":
        return {**test, "source_group": test["group"], "group": "Core"}
    return {**test}


SETTINGS = (
    "model",
    "agent",
    "agent_version",
    "thinking",
    "prompt_arm",
    "protocol",
    "formal",
    "repeat",
)
SEMANTICS = {
    "codex": "inclusive_cache",
    "claude_code": "exclusive_cache",
    "opencode": "exclusive_cache",
}
VERSION_EVIDENCE_FIELDS = (
    "candidate",
    "evaluation_sha256",
    "inference_sha256",
    "tokens",
    "inference_seconds",
    "evaluation_seconds",
    "tests",
    "state",
    "valid_execution_failure",
)


def sr_version_binding(cell: dict, cp: dict, chain_id: str) -> dict:
    """Bind an audit to the selected evidence, not merely the task name."""
    return {
        "cell_id": cell["id"],
        "chain_id": chain_id,
        "prompt_arm": cell.get("prompt_arm"),
        "checkpoint_id": cp["target_checkpoint"],
        **{
            k: cell.get(k)
            for k in (
                "generation",
                "evaluation_generation",
                "selected_attempt",
                "selected_evaluation",
            )
        },
        "checkpoint_evidence_sha256": identity(
            {k: cp.get(k) for k in VERSION_EVIDENCE_FIELDS}
        ),
    }


def apply_sr_version_audit(
    row: dict, cell: dict | None, cp: dict | None, manifest: dict
) -> None:
    """Use explicit, read-only audited target bindings; preserve all decisions."""
    if cell is None or cp is None:
        return
    original = cp.get("compatibility", {})
    row["original_compatibility"] = dict(original)
    audit = manifest.get("sr_version_audit", {})
    binding = sr_version_binding(cell, cp, row["chain_id"])
    key = identity(binding)
    record = audit.get("records", {}).get(key)
    if not record:
        return
    scope = "|".join(
        (row["chain_id"], cell.get("prompt_arm", ""), cp["target_checkpoint"])
    )
    target = audit.get("targets", {}).get(scope)
    preps = audit.get("preparations", {})
    source = preps.get(record.get("source_preparation"), {})
    evaluated = preps.get(record.get("evaluation_preparation"), {})
    if not (
        audit.get("schema_version") == 1
        and record.get("binding") == binding
        and record.get("source_compatibility") == original
        and cell.get("mode") == "sr"
        and cell.get("planned_targets") == [cp["target_checkpoint"]]
        and target
        and target == binding["evaluation_generation"]
        and source.get("verified") is True
        and evaluated.get("verified") is True
        and source.get("generation") == binding["generation"]
        and evaluated.get("generation") == target
    ):
        return
    resolved = dict(original)
    same = binding["generation"] == target
    # A differing evaluation version never makes old timings/costs identical.
    # Only unknown entries on the exact same frozen version can be resolved.
    if same:
        for metric_name in ("score", "cost", "time", "calls"):
            if resolved.get(metric_name) == "unknown":
                resolved[metric_name] = "identical"
    row.update(
        {
            "version_audit_id": key,
            "target_generation": target,
            "resolved_compatibility": resolved,
            "compatibility_source": "audited_same_generation"
            if same
            else "existing_reviewed_reevaluation",
            "compatible": resolved.get("score") in {"identical", "compatible"},
            "cost_compatible": resolved.get("cost")
            in {"identical", "compatible"},
            "time_compatible": resolved.get("time")
            in {"identical", "compatible"},
        }
    )


def identity(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


def number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value >= 0
    )


def integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def complete_sum(values: list[Any]) -> float | None:
    return sum(values) if values and all(number(v) for v in values) else None


def ratio(top: float | None, bottom: float | None) -> float | None:
    return (
        top / bottom
        if top is not None and bottom is not None and bottom > 0
        else None
    )


def validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("schema_version") != 1 or not manifest.get(
        "benchmark_version"
    ):
        raise ValueError("Expected a versioned benchmark manifest")
    chains = manifest.get("chains", [])
    if not chains or len({c["id"] for c in chains}) != len(chains):
        raise ValueError("Manifest chains must be nonempty and unique")
    aliases: set[str] = set()
    for chain in chains:
        names = {chain["id"], *chain.get("aliases", [])}
        if aliases & names:
            raise ValueError("Ambiguous chain aliases")
        aliases.update(names)
        cps = chain["checkpoints"]
        if not cps or len({c["id"] for c in cps}) != len(cps):
            raise ValueError("Manifest checkpoints must be nonempty and unique")
        for cp in cps:
            for mode, tests in cp.get("tests", {}).items():
                if mode not in {"pipeline", "sr"}:
                    raise ValueError("Unknown test manifest mode")
                if len({t["nodeid"] for t in tests}) != len(tests):
                    raise ValueError("Duplicate required test ID")
                if any(
                    scoring_group(t["group"]) not in GROUPS + EXTRA_GROUPS
                    for t in tests
                ):
                    raise ValueError("Unknown test group")


def estimate_cost(
    usage: dict[str, Any] | None,
    book: dict[str, Any],
    model: str,
    semantics: str,
    policy: str = "actual",
    *,
    per_request: bool = False,
    request_input_upper_bound: int | None = None,
) -> dict[str, Any]:
    """Inclusive input already contains cache tokens; reasoning is in output.

    fixed_85 is a counterfactual price estimate: 15% uncached / 85% read,
    no additional cache-write charge. It never changes the recorded usage.
    """
    result: dict[str, Any] = {
        "usd": None,
        "policy": policy,
        "price_version": book.get("version"),
        "currency": "USD",
        "input_semantics": semantics,
    }

    def missing(reason: str) -> dict[str, Any]:
        return {**result, "reason": reason}

    if policy not in {"actual", "fixed_85"}:
        raise ValueError("Unknown cache policy")
    if (
        book.get("currency") != "USD"
        or book.get("unit") != "per_million_tokens"
    ):
        return missing("unsupported_price_units")
    if semantics not in {"inclusive_cache", "exclusive_cache"}:
        return missing("unknown_input_semantics")
    usage = usage or {}
    required = {"input", "output"}
    if policy == "actual" or semantics == "exclusive_cache":
        required |= {"cache_read", "cache_write"}
    if not required <= usage.keys():
        return missing("missing_usage")
    if any(not integer(usage[k]) for k in required):
        return missing("invalid_usage")
    read = usage.get("cache_read", 0)
    write = usage.get("cache_write", 0)
    if not integer(read) or not integer(write):
        return missing("invalid_usage")
    prompt = usage["input"]
    if semantics == "exclusive_cache":
        prompt += read + write
    uncached = prompt - read - write
    if uncached < 0:
        return missing("inconsistent_cache_tokens")
    if prompt + usage["output"] == 0:
        return missing("zero_usage_not_verified")
    rates = [r for r in book.get("rates", []) if r["model"] == model]
    if not rates:
        return missing("unregistered_model")
    context = prompt
    assumed_bound = False
    if len(rates) > 1 and not per_request:
        boundaries = [r["max_context"] for r in rates if r.get("max_context") is not None]
        if (not integer(request_input_upper_bound) or request_input_upper_bound <= 0
                or not boundaries or request_input_upper_bound > min(boundaries)):
            return missing("request_context_required")
        context = request_input_upper_bound
        assumed_bound = True
    rates = sorted(
        (
            r
            for r in rates
            if r.get("max_context") is None or context <= r["max_context"]
        ),
        key=lambda r: r.get("max_context") or float("inf"),
    )
    if not rates:
        return missing("context_out_of_range")
    rate = rates[0]
    if policy == "fixed_85":
        uncached, read, write = prompt * 0.15, prompt * 0.85, 0
    counts = {
        "input": uncached,
        "cache_read": read,
        "cache_write": write,
        "output": usage["output"],
    }
    for key, count in counts.items():
        if count and not number(rate.get(key)):
            return missing(f"missing_{key}_price")
    amounts = {k: n * (rate.get(k) or 0) / 1_000_000 for k, n in counts.items()}
    return {
        **result,
        "usd": sum(amounts.values()),
        "reason": None,
        "total_input_tokens": prompt,
        "billed_tokens": counts,
        "components_usd": amounts,
        "rate": rate,
        "cache_hit_rate": ratio(read, prompt),
        **({"request_input_upper_bound": request_input_upper_bound,
            "context_tier_basis": "user_declared_request_bound"} if assumed_bound else {}),
        "estimate_kind": "fixed_cache_scenario"
        if policy == "fixed_85"
        else "usage_based_estimate",
    }


def checkpoint_cost(
    cp: dict[str, Any], cell: dict[str, Any], book: dict[str, Any], policy: str
) -> dict[str, Any]:
    semantics = cp.get("usage_input_semantics") or SEMANTICS.get(
        cell["agent"], "unknown"
    )
    bounds = [rule for rule in book.get("aggregate_request_bounds", [])
              if rule["model"] == cell["model"] and rule["agent"] == cell["agent"]
              and cell.get("protocol") in rule.get("protocols", [])]
    bound = bounds[0] if len(bounds) == 1 else None
    result = estimate_cost(
        cp.get("tokens"), book, cell["model"], semantics, policy,
        request_input_upper_bound=bound["max_request_input_tokens"] if bound else None,
    )
    if result.get("context_tier_basis") == "user_declared_request_bound":
        result["context_bound_source"] = bound["source"]
    requests = (cp.get("calls") or {}).get("responses", [])
    # A native lower bound is not enough: reconcile every billed token first.
    if requests and all(
        sum(r.get("usage", {}).get(k, 0) for r in requests)
        == (cp.get("tokens") or {}).get(k)
        for k in ("input", "output", "cache_read", "cache_write")
    ):
        costs = [
            estimate_cost(
                r["usage"],
                book,
                cell["model"],
                r.get("input_semantics", semantics),
                policy,
                per_request=True,
            )
            for r in requests
        ]
        if all(c["usd"] is not None for c in costs):
            return {
                "usd": sum(c["usd"] for c in costs),
                "policy": policy,
                "price_version": book.get("version"),
                "reason": None,
                "source": "reconciled_native_requests",
                "requests": costs,
            }
    return result


def group_results(
    cp: dict[str, Any], spec: dict[str, Any], mode: str
) -> tuple[dict[str, Any], str | None]:
    """Prefer required IDs; explicit evaluator collection totals are a fallback.

    A missing group is never treated as an empty group. Required skipped tests
    count as unexecuted. Legacy Functionality is merged into Core exactly once;
    original source groups remain available on the projected test nodes.
    """
    nodes = [scoring_test(t) for t in cp.get("tests") or []]
    exclusions = {
        item["nodeid"]: item
        for item in spec.get("non_applicable_tests", [])
        if item["mode"] == mode
        and cp.get("evaluation_generation") in item["generations"]
    }
    # Some tests assert delivery hygiene before their supersession guard. An
    # actual failure there remains a failure; only the proven skip is N/A.
    excluded = [
        t
        for t in nodes
        if t["nodeid"] in exclusions and t.get("status") == "skipped"
    ]
    excluded_ids = {t["nodeid"] for t in excluded}
    nodes = [t for t in nodes if t["nodeid"] not in excluded_ids]
    required = spec.get("tests", {}).get(mode)
    if required is not None:
        required = [scoring_test(t) for t in required]
    expected = cp.get("expected_test_counts", {}).get("groups")
    if expected is not None:
        expected = dict(expected)
        legacy = expected.pop("functionality", 0)
        if not integer(legacy) or not integer(expected.get("core", 0)):
            return {}, "test_inventory_count_mismatch"
        expected["core"] = expected.get("core", 0) + legacy
    by_group: dict[str, list[dict[str, Any]]] = defaultdict(list)
    if required is not None:
        observed = {t["nodeid"]: t for t in nodes}
        if len(observed) != len(nodes):
            return {}, "duplicate_test_result"
        for test in required:
            if test.get("applicable", True):
                actual = observed.get(test["nodeid"], {})
                if (
                    actual
                    and actual.get("group", "").lower() != test["group"].lower()
                ):
                    return {}, "test_group_mismatch"
                by_group[test["group"].lower()].append(
                    {
                        **test,
                        **(
                            {"source_group": actual["source_group"]}
                            if "source_group" in actual
                            else {}
                        ),
                        "status": actual.get("status", "not_executed"),
                    }
                )
        source = "frozen_required_test_ids"
    elif nodes:
        if len({t["nodeid"] for t in nodes}) != len(nodes):
            return {}, "duplicate_test_result"
        for test in nodes:
            by_group[test["group"].lower()].append(test)
        source = "evaluator_collection_nodes"
    else:
        source = "explicit_evaluator_group_totals"
    if set(by_group) - set(GROUPS + EXTRA_GROUPS):
        return {}, "unknown_test_group"
    groups = {}
    for group in GROUPS + EXTRA_GROUPS:
        if required is not None or nodes:
            tests = by_group[group]
            states = Counter(t.get("status", "not_executed") for t in tests)
            total = len(tests)
            passed = states["passed"]
            detail = {
                "failed": states["failed"],
                "error": states["error"],
                "not_executed": total
                - passed
                - states["failed"]
                - states["error"],
                "tests": tests,
            }
        else:
            saved = (cp.get("test_counts") or {}).get(group)
            if group == "core":
                legacy = (cp.get("test_counts") or {}).get("functionality")
                if legacy is not None:
                    for counts in (saved, legacy):
                        if (
                            not counts
                            or not integer(counts.get("total"))
                            or not integer(counts.get("passed"))
                            or counts["passed"] > counts["total"]
                        ):
                            return {}, "missing_group_counts"
                    saved = {
                        key: saved[key] + legacy[key]
                        for key in ("passed", "total")
                    }
            if (
                not saved
                or not integer(saved.get("total"))
                or not integer(saved.get("passed"))
                or saved["passed"] > saved["total"]
            ):
                if group in EXTRA_GROUPS:
                    continue
                return {}, "missing_group_counts"
            total, passed = saved["total"], saved["passed"]
            detail = {
                "failed": None,
                "error": None,
                "not_executed": None,
                "tests": None,
            }
        if expected is not None:
            count = expected.get(group)
            # Docker collect-only inventories include superseded checkpoint
            # nodes. Remove only observed skips with a generation-bound N/A
            # decision, matching the node projection above.
            excluded_count = sum(t["group"].lower() == group for t in excluded)
            if not integer(count) or count < excluded_count or total != count - excluded_count:
                return {}, "test_inventory_count_mismatch"
        groups[group] = {
            "applicable": total > 0,
            "expected": total,
            "passed": passed,
            "all_passed": total > 0 and passed == total,
            "source": source,
            "non_applicable": [
                {**t, "applicability_evidence": exclusions[t["nodeid"]]}
                for t in excluded
                if t["group"].lower() == group
            ],
            **detail,
        }
    if not groups["structure"]["expected"] or not groups["core"]["expected"]:
        return groups, "empty_required_structure_or_core"
    return groups, None


def normalize_checkpoint(
    cell: dict[str, Any] | None,
    cp: dict[str, Any] | None,
    chain: dict[str, Any],
    spec: dict[str, Any],
    mode: str,
    book: dict[str, Any],
    *,
    stopped: bool = False,
    reason: str | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "mode": mode,
        "chain_id": chain["id"],
        "checkpoint_id": spec["id"],
        "checkpoint_index": next(
            i
            for i, item in enumerate(chain["checkpoints"], 1)
            if item["id"] == spec["id"]
        ),
        "task_type": chain.get("task_type"),
        "primary_activity": spec.get("primary_activity"),
        "secondary_activity": spec.get("secondary_activity"),
        "execution_status": "pending",
        "strict_pass": None,
        "reason": reason,
        "groups": None,
        "cell_id": (cell or {}).get("id"),
        "compatible": False,
        "costs": {
            p: {"usd": None, "reason": "not_scheduled"}
            for p in ("actual", "fixed_85")
        },
        "agent_elapsed_seconds": None,
        "evaluation_elapsed_seconds": None,
    }
    if reason and (cell is None or cp is None):
        row["execution_status"] = "invalid"
        return row
    if stopped and not reason:
        return {
            **row,
            "execution_status": "not_reached",
            "strict_pass": 0,
            "compatible": True,
            "reason": "verified_structure_stop",
            "costs": {
                p: {"usd": 0, "reason": "not_invoked", "policy": p}
                for p in ("actual", "fixed_85")
            },
            "agent_elapsed_seconds": 0,
            "evaluation_elapsed_seconds": 0,
        }
    if cell is None or cp is None:
        row["reason"] = "missing_checkpoint_result" if cell else "not_scheduled"
        return row
    override = cell.get("score_override", {})
    if (
        override.get("value") == 0
        and override.get("reason") == "agent_failure"
        and cell.get("status") == "completed"
        and cell.get("outcome") == "agent_failure"
        and not reason
    ):
        # An explicitly reviewed group-level zero is a counted failure. Preserve
        # raw states/verdicts separately; no missing simulation is fabricated.
        inventory = cell.get("expected_test_counts", {}).get(
            spec["id"], cp.get("expected_test_counts", {})
        )
        totals = inventory.get("groups")
        if totals is None:
            totals = {
                key: value.get("total")
                for key, value in (cp.get("test_counts") or {}).items()
            }
        totals = {key: value for key, value in totals.items() if integer(value)}
        if "functionality" in totals:
            totals["core"] = totals.get("core", 0) + totals["functionality"]
        costs = {p: checkpoint_cost(cp, cell, book, p) if cp.get("tokens")
                 else row["costs"][p] for p in ("actual", "fixed_85")}
        policy = book.get("temporary_failure_cost_policy", {})
        approved = (cell.get("id") in policy.get("cell_ids", [])
                    and cell.get("model") == policy.get("model")
                    and cell.get("agent") == policy.get("agent")
                    and policy.get("value_usd") == 0 and policy.get("temporary") is True)
        if approved:
            costs = {p: {
                "usd": 0, "policy": p, "reason": None,
                "price_version": book.get("version"), "currency": "USD",
                "imputed": True, "estimate_kind": "temporary_user_zero_for_failed_run",
                "imputation_source": policy["source"], "original_cost": c,
            } for p, c in costs.items()}
        # A score override must not discard already recorded execution times.
        elapsed = cp.get("inference_seconds")
        evaluation_elapsed = cp.get("evaluation_seconds")
        failed_before = False
        for previous in cell.get("checkpoints", []):
            if (previous.get("target_checkpoint") or previous.get("checkpoint")) == spec["id"]:
                break
            failed_before |= previous.get("state") == "inference_error"
        not_invoked = (failed_before and cp.get("state") == "missing"
                       and elapsed is None and evaluation_elapsed is None
                       and not any(cp.get(k) for k in
                                   ("started_at", "completed_at", "candidate", "inference_sha256", "tokens"))
                       and not any((cp.get("calls") or {}).get(k) for k in
                                   ("native_events", "observed_responses", "observed_tool_calls", "http_requests")))
        if not_invoked:
            elapsed = evaluation_elapsed = 0
        return {
            **row,
            "execution_status": "executed",
            "strict_pass": 0,
            "compatible": cp.get("compatibility", {}).get("score")
            in {"identical", "compatible"},
            "reason": "provisional_agent_failure",
            "raw_execution_status": cp.get("state"),
            "score_override": override,
            "failure_group_totals": totals,
            "costs": costs,
            "cost_compatible": approved or cp.get("compatibility", {}).get("cost")
            in {"identical", "compatible"},
            "agent_elapsed_seconds": elapsed,
            "evaluation_elapsed_seconds": evaluation_elapsed,
            "raw_agent_elapsed_seconds": cp.get("inference_seconds"),
            "timing_source": "not_invoked_after_recorded_failure" if not_invoked else "recorded_inference_seconds",
            "time_compatible": cp.get("compatibility", {}).get("time")
            in {"identical", "compatible"},
        }
    row.update(
        {
            "candidate": cp.get("candidate"),
            "evaluation_sha256": cp.get("evaluation_sha256"),
            "inference_sha256": cp.get("inference_sha256"),
            "usage": cp.get("tokens"),
            "result_path": cp.get("result_path"),
            "log_path": cp.get("log_path"),
            "compatible": cp.get("compatibility", {}).get("score")
            in {"identical", "compatible"},
            "cost_compatible": cp.get("compatibility", {}).get("cost")
            in {"identical", "compatible"},
            "time_compatible": cp.get("compatibility", {}).get("time")
            in {"identical", "compatible"},
            "agent_elapsed_seconds": cp.get("inference_seconds"),
            "evaluation_elapsed_seconds": cp.get("evaluation_seconds"),
            "costs": {
                p: checkpoint_cost(cp, cell, book, p)
                for p in ("actual", "fixed_85")
            },
        }
    )
    if reason:
        return {**row, "execution_status": "invalid", "reason": reason}
    state = cp.get("execution_status", cp.get("state"))
    if (
        state in {"invalid", "evaluation_error"}
        or cell.get("status") in {"infra_failed", "quarantined"}
        or state == "inference_error"
        and cp.get("valid_execution_failure") is not True
    ):
        # Only an explicit valid-run exception is a scored execution failure.
        return {
            **row,
            "execution_status": "invalid",
            "reason": cp.get("stop_reason") or state,
        }
    if cell.get("status") in {"pending", "running", "interrupted"} or state in {
        "missing",
        "pending",
        "awaiting_evaluation",
        "stopped_by_policy",
        "not_reached",
    }:
        return {**row, "reason": "unverified_or_unfinished_result"}
    if cp.get("valid_execution_failure") is True:
        return {
            **row,
            "execution_status": "executed",
            "strict_pass": 0,
            "reason": cp.get("stop_reason") or "valid_execution_failure",
        }
    if state not in {"passed", "failed", "executed"}:
        return {**row, "reason": "unknown_result_state"}
    bound = dict(cp)
    bound["evaluation_generation"] = cell.get("evaluation_generation")
    bound["expected_test_counts"] = cell.get("expected_test_counts", {}).get(
        spec["id"], cp.get("expected_test_counts", {})
    )
    groups, problem = group_results(bound, spec, mode)
    if problem:
        return {
            **row,
            "execution_status": "invalid",
            "groups": groups,
            "reason": problem,
        }
    strict = int(
        all(g["all_passed"] for g in groups.values() if g["applicable"])
    )
    return {
        **row,
        "execution_status": "executed",
        "strict_pass": strict,
        "groups": groups,
        "reason": None,
    }


def metric(
    values: list[Any],
    unit: str,
    eligible: bool = True,  # noqa: FBT001, FBT002
) -> dict[str, Any]:
    known = [v for v in values if number(v)]
    complete = bool(values) and len(known) == len(values)
    raw = mean(known) if complete else None
    return {
        "value": raw if eligible else None,
        "raw_value": raw,
        "observed_value": mean(known) if known else None,
        "known_units": len(known),
        "denominator": len(values),
        "unit": unit,
        "reason": None
        if complete and eligible
        else "incomplete_results"
        if not complete
        else "unverified_comparability",
    }


def summarize(
    rows: list[dict[str, Any]],
    chains: list[dict[str, Any]],
    formal: bool,  # noqa: FBT001 - internal aggregation flag
    timing_policy: str,
) -> dict[str, Any]:
    by_chain: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_chain[row["chain_id"]].append(row)
    pipeline = [r for r in rows if r["mode"] == "pipeline"]
    sr = [r for r in rows if r["mode"] == "sr"]
    (
        delivery,
        completion,
        final_completion,
        trajectories,
        sr_macro,
        sr_all,
        chain_rows,
    ) = ([], [], [], [], [], [], [])

    def final_completion_value(
        pipeline_rows: list[dict[str, Any]], chain: dict[str, Any]
    ) -> float | None:
        """Score only the manifest-defined final checkpoint.

        A verified progression stop before that checkpoint is an evidenced zero.
        Pending, invalid, or otherwise incomplete evidence remains unknown.
        """
        if not pipeline_rows:
            return None
        final_id = chain["checkpoints"][-1]["id"]
        final = next(
            (row for row in pipeline_rows if row["checkpoint_id"] == final_id),
            None,
        )
        if final is None:
            return None
        if final["execution_status"] == "not_reached":
            # normalize_checkpoint emits not_reached only for a verified stop.
            return 0
        if final["execution_status"] != "executed":
            return None
        groups = final.get("groups") or {}
        structure = groups.get("structure")
        core = groups.get("core")
        regression = groups.get("regression")
        if not structure and final.get("strict_pass") == 0:
            # Explicitly verified valid-run agent/budget failure; no Structure
            # pass was obtained at the preset final checkpoint.
            return 0
        if not structure or not core or not regression:
            return None
        if not structure["all_passed"]:
            return 0
        total = core["expected"] + regression["expected"]
        if total <= 0:
            return None
        passed = core["passed"] + regression["passed"]
        return passed / total

    for chain in chains:
        chain_id = chain["id"]
        p = [r for r in by_chain[chain_id] if r["mode"] == "pipeline"]
        s = [r for r in by_chain[chain_id] if r["mode"] == "sr"]
        pvalues = [r["strict_pass"] for r in p]
        svalues = [r["strict_pass"] for r in s]
        p_complete = bool(pvalues) and all(v is not None for v in pvalues)
        s_complete = bool(svalues) and all(v is not None for v in svalues)
        d = p[-1]["strict_pass"] if p_complete else None
        q = mean(pvalues) if p_complete else None
        f = final_completion_value(p, chain)
        final_groups = (p[-1].get("groups") or {}) if p else {}
        delivery.append(d)
        completion.append(q)
        final_completion.append(f)
        trajectories.append(int(all(pvalues)) if p_complete else None)
        sr_macro.append(mean(svalues) if s_complete else None)
        sr_all.append(int(all(svalues)) if s_complete else None)
        chain_rows.append(
            {
                "chain_id": chain_id,
                "planned_length": len(chain["checkpoints"]),
                "final_checkpoint_id": chain["checkpoints"][-1]["id"],
                "num_reached": sum(
                    r["execution_status"] == "executed" for r in p
                ),
                "num_strict_passed": sum(v == 1 for v in pvalues),
                "final_reached": bool(
                    p and p[-1]["execution_status"] == "executed"
                ),
                "d_j": d,
                "q_j": q,
                "f_j": f,
                "final_structure_all_passed": final_groups.get(
                    "structure", {}
                ).get("all_passed"),
                **{
                    "final_" + name: {
                        key: final_groups[name][key]
                        for key in ("passed", "expected", "applicable")
                    }
                    if name in final_groups
                    else None
                    for name in ("core", "regression")
                },
                "cost_usd_by_policy": {
                    policy: complete_sum([r["costs"][policy]["usd"] for r in p])
                    for policy in ("actual", "fixed_85")
                },
                "agent_elapsed_seconds": complete_sum(
                    [r["agent_elapsed_seconds"] for r in p]
                ),
                "evaluation_elapsed_seconds": complete_sum(
                    [r["evaluation_elapsed_seconds"] for r in p]
                ),
            }
        )
    p_eligible = formal and all(r["compatible"] for r in pipeline)
    s_eligible = formal and all(r["compatible"] for r in sr)
    primary = {
        "pipeline_fdr": metric(delivery, "task_chain", p_eligible),
        "pipeline_cc": metric(completion, "task_chain", p_eligible),
        "pipeline_fc": metric(final_completion, "task_chain", p_eligible),
        "sr_cpr": metric(
            [r["strict_pass"] for r in sr], "checkpoint", s_eligible
        ),
    }

    def core(r):
        return (r.get("groups") or {}).get("core")

    def regression(r):
        return (r.get("groups") or {}).get("regression")

    def failure_total(r, group):
        if r.get("reason") == "provisional_agent_failure":
            return r.get("failure_group_totals", {}).get(group)
        return None

    def core_pass(r):
        if r.get("reason") == "provisional_agent_failure":
            return 0
        return (
            int(core(r)["all_passed"])
            if core(r)
            else 0
            if r["execution_status"] == "not_reached"
            else None
        )

    sr_reg = [
        r for r in sr
        if (regression(r) is None and failure_total(r, "regression") != 0)
        or (regression(r) is not None and regression(r)["applicable"])
    ]
    auxiliary = {
        "pipeline_core_pass_rate": metric(
            [core_pass(r) for r in pipeline], "checkpoint", p_eligible
        ),
        "sr_core_pass_rate": metric(
            [core_pass(r) for r in sr], "checkpoint", s_eligible
        ),
        "sr_core_completion": metric(
            [
                ratio(core(r)["passed"], core(r)["expected"])
                if core(r)
                else 0
                if (failure_total(r, "core") or 0) > 0
                else None
                for r in sr
            ],
            "checkpoint",
            s_eligible,
        ),
        "sr_regression_failure_rate": metric(
            [
                1 - regression(r)["passed"] / regression(r)["expected"]
                if regression(r)
                else 1
                if (failure_total(r, "regression") or 0) > 0
                else None
                for r in sr_reg
            ],
            "applicable_sr_checkpoint",
            s_eligible,
        ),
        "pipeline_trajectory_success_rate": metric(
            trajectories, "task_chain", p_eligible
        ),
        "sr_all_checkpoint_success_rate": metric(
            sr_all, "task_chain", s_eligible
        ),
        "sr_chain_macro": metric(sr_macro, "task_chain", s_eligible),
    }
    costs, efficiencies = {}, {}
    for mode, mode_rows in (("pipeline", pipeline), ("sr", sr)):
        units = len(chains) if mode == "pipeline" else len(sr)
        times = [r["agent_elapsed_seconds"] for r in mode_rows]
        if timing_policy == "agent_plus_evaluation":
            times = [
                complete_sum(
                    [
                        r["agent_elapsed_seconds"],
                        r["evaluation_elapsed_seconds"],
                    ]
                )
                for r in mode_rows
            ]
        total_time = complete_sum(times)
        for policy in ("actual", "fixed_85"):
            known_costs = [r["costs"][policy]["usd"] for r in mode_rows]
            total_cost = complete_sum(known_costs)
            costs[f"{mode}_{policy}"] = {
                "unit": "task_chain" if mode == "pipeline" else "checkpoint",
                "denominator": units,
                "total_cost_usd": total_cost,
                "known_total_cost_usd": sum(v for v in known_costs if number(v)),
                "mean_cost_usd": ratio(total_cost, units),
                "known_cost_records": sum(number(v) for v in known_costs),
                "imputed_cost_records": sum(bool(r["costs"][policy].get("imputed")) for r in mode_rows),
                "expected_cost_records": len(mode_rows),
                "total_time_seconds": total_time,
                "mean_time_seconds": ratio(total_time, units),
                "known_time_records": sum(number(v) for v in times),
                "incompatible_time_records": sum(r.get("time_compatible") is False for r in mode_rows),
                "evaluation_seconds": complete_sum(
                    [r["evaluation_elapsed_seconds"] for r in mode_rows]
                ),
                "cost_missing_reasons": dict(
                    Counter(
                        r["costs"][policy].get("reason") or "unknown"
                        for r in mode_rows
                        if r["costs"][policy]["usd"] is None
                    )
                ),
                "timing_policy": timing_policy,
            }
            for name in (
                ("pipeline_fdr", "pipeline_cc", "pipeline_fc")
                if mode == "pipeline"
                else ("sr_cpr",)
            ):
                q = primary[name]["value"]
                avg_cost = ratio(total_cost, units)
                avg_time = ratio(total_time, units)
                cost_compatible = all(
                    r.get(
                        "cost_compatible",
                        r["execution_status"] == "not_reached",
                    )
                    for r in mode_rows
                )
                time_compatible = all(
                    r.get(
                        "time_compatible",
                        r["execution_status"] == "not_reached",
                    )
                    for r in mode_rows
                )
                efficiencies[f"{name}_{policy}"] = {
                    "performance": q,
                    "cost_efficiency_per_usd": ratio(q, avg_cost)
                    if cost_compatible
                    else None,
                    "time_efficiency_per_second": ratio(q, avg_time)
                    if time_compatible
                    else None,
                    "time_efficiency_per_hour": ratio(q, avg_time) * 3600
                    if time_compatible and ratio(q, avg_time) is not None
                    else None,
                    "observed_time_efficiency_per_hour": ratio(q, avg_time) * 3600
                    if ratio(q, avg_time) is not None else None,
                    "reason_cost": "unverified_comparability"
                    if not cost_compatible
                    else "missing_or_zero_denominator"
                    if not avg_cost
                    else primary[name]["reason"],
                    "reason_time": "unverified_comparability"
                    if not time_compatible
                    else "missing_or_zero_denominator"
                    if not avg_time
                    else primary[name]["reason"],
                }
    return {
        "primary": primary,
        "auxiliary": auxiliary,
        "resources": costs,
        "efficiencies": efficiencies,
        "chains": chain_rows,
        "coverage": {
            "num_chains": len(chains),
            "num_checkpoints": sum(len(c["checkpoints"]) for c in chains),
            **{
                mode: {
                    "num_" + status: sum(
                        r["execution_status"] == status
                        for r in rows
                        if r["mode"] == mode
                    )
                    for status in (
                        "executed",
                        "not_reached",
                        "pending",
                        "invalid",
                    )
                }
                for mode in ("pipeline", "sr")
            },
        },
    }


def calculate(
    analysis: dict[str, Any],
    manifest: dict[str, Any],
    book: dict[str, Any],
    *,
    timing_policy: str = "agent_only",
) -> dict[str, Any]:
    validate_manifest(manifest)
    if timing_policy not in {"agent_only", "agent_plus_evaluation"}:
        raise ValueError("Unknown timing policy")
    aliases = {
        name: c["id"]
        for c in manifest["chains"]
        for name in {c["id"], *c.get("aliases", [])}
    }
    settings: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rejected = []
    protocol_aliases = manifest.get("protocol_equivalence", {})
    protocols = analysis.get("protocols", {})
    for cell in analysis["cells"]:
        if cell.get("problem") not in aliases:
            rejected.append(
                {"cell_id": cell["id"], "reason": "chain_not_in_manifest"}
            )
            continue
        key = {k: cell.get(k) for k in SETTINGS}
        equivalence = protocol_aliases.get(cell.get("protocol"))
        if equivalence:
            protocol = protocols.get(cell["protocol"])
            settings_only = {
                k: v
                for k, v in (protocol or {}).items()
                if k not in {"id", "name", "version"}
            }
            if (
                protocol
                and identity(settings_only)
                == equivalence["execution_settings_sha256"]
            ):
                key["protocol"] = equivalence["config_id"]
        settings[json.dumps(key, sort_keys=True)].append(cell)
    reports = []
    for key, cells in sorted(settings.items()):
        config = json.loads(key)
        rows, problems = [], []
        for chain in manifest["chains"]:
            p_cells = [
                c
                for c in cells
                if aliases[c["problem"]] == chain["id"]
                and c["mode"] == "pipeline"
            ]
            specs = chain["checkpoints"]
            target_ids = [s["id"] for s in specs]
            pcell = p_cells[0] if len(p_cells) == 1 else None
            p_issue = "ambiguous_pipeline_trial" if len(p_cells) > 1 else None
            if pcell and pcell.get("planned_targets") != target_ids:
                p_issue = "pipeline_manifest_target_mismatch"
            if pcell and pcell.get("progression_policy") != "structure-cases":
                p_issue = "non_structure_progression_protocol"
            stop, blocked = False, None
            for spec in specs:
                p_matches = [
                    cp
                    for cp in (pcell or {}).get("checkpoints", [])
                    if cp["target_checkpoint"] == spec["id"]
                ]
                pcp = p_matches[0] if len(p_matches) == 1 else None
                reason = (
                    p_issue
                    or blocked
                    or (
                        "duplicate_checkpoint_result"
                        if len(p_matches) > 1
                        else None
                    )
                )
                if (
                    stop
                    and pcp
                    and pcp.get("state")
                    not in {"stopped_by_policy", "not_reached", "missing"}
                ):
                    reason = "executed_after_structure_failure"
                if (
                    stop
                    and pcp
                    and (pcp.get("inference_sha256") or pcp.get("candidate"))
                ):
                    reason = "recorded_execution_after_structure_stop"
                prow = normalize_checkpoint(
                    pcell,
                    pcp,
                    chain,
                    spec,
                    "pipeline",
                    book,
                    stopped=stop,
                    reason=reason,
                )
                rows.append(prow)
                structure = (prow.get("groups") or {}).get("structure")
                if (
                    pcell
                    and pcell.get("status") == "completed"
                    and structure
                    and structure["expected"]
                    and not structure["all_passed"]
                ):
                    stop = True
                elif (
                    pcell
                    and pcell.get("status") == "completed"
                    and pcp
                    and pcp.get("valid_execution_failure") is True
                    and prow["execution_status"] == "executed"
                    and not (structure and structure["all_passed"])
                ):
                    # A valid, terminal budget/agent failure cannot provide the
                    # required Structure pass; later rounds were not invoked.
                    stop = True
                elif pcell and prow["execution_status"] in {
                    "pending",
                    "invalid",
                }:
                    blocked = "predecessor_structure_unresolved"
                s_matches = [
                    (c, cp)
                    for c in cells
                    if aliases[c["problem"]] == chain["id"]
                    and c["mode"] == "sr"
                    for cp in c.get("checkpoints", [])
                    if cp["target_checkpoint"] == spec["id"]
                ]
                scell, scp = (
                    s_matches[0] if len(s_matches) == 1 else (None, None)
                )
                srow = normalize_checkpoint(
                    scell,
                    scp,
                    chain,
                    spec,
                    "sr",
                    book,
                    reason="ambiguous_sr_trial" if len(s_matches) > 1 else None,
                )
                apply_sr_version_audit(srow, scell, scp, manifest)
                rows.append(srow)
            for row in rows[-2 * len(specs) :]:
                if row["reason"] and row["execution_status"] == "invalid":
                    problems.append(
                        {
                            k: row[k]
                            for k in (
                                "mode",
                                "chain_id",
                                "checkpoint_id",
                                "cell_id",
                                "reason",
                            )
                        }
                    )
        summary = summarize(
            rows, manifest["chains"], bool(config["formal"]), timing_policy
        )
        by_type = {}
        for task_type in sorted({c["task_type"] for c in manifest["chains"]}):
            selected = [
                c for c in manifest["chains"] if c["task_type"] == task_type
            ]
            by_type[task_type] = summarize(
                [r for r in rows if r["task_type"] == task_type],
                selected,
                bool(config["formal"]),
                timing_policy,
            )
        by_activity = {}
        for activity in ("Build", "Evolve", "Repair", "Verify"):
            selected = [
                r
                for r in rows
                if r["mode"] == "sr" and r["primary_activity"] == activity
            ]
            by_activity[activity] = metric(
                [r["strict_pass"] for r in selected],
                "checkpoint",
                bool(config["formal"])
                and all(r["compatible"] for r in selected),
            )
        reports.append(
            {
                "id": identity(config),
                "config": config,
                **summary,
                "by_task_type": by_type,
                "sr_by_activity": by_activity,
                "checkpoint_records": rows,
                "issues": problems,
                "configuration_bindings": [
                    {
                        "cell_id": c["id"],
                        "chain_id": aliases[c["problem"]],
                        "mode": c["mode"],
                        "protocol": c.get("protocol"),
                        "agent_config": c.get("agent_config"),
                        "generation": c.get("generation"),
                        "evaluation_generation": c.get("evaluation_generation"),
                    }
                    for c in cells
                ],
                "retry_overhead": [
                    {
                        "cell_id": c["id"],
                        "attempt_count": c.get("attempt_count"),
                        "cost_all_attempts_usd": c.get(
                            "official_cost_all_attempts"
                        ),
                        "wall_all_attempts_seconds": c.get(
                            "wall_seconds_all_attempts"
                        ),
                    }
                    for c in cells
                ],
            }
        )
    repeats: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for report in reports:
        repeats[
            json.dumps(
                {k: v for k, v in report["config"].items() if k != "repeat"},
                sort_keys=True,
            )
        ].append(report)
    repeated = []
    for key, runs in repeats.items():
        repeated.append(
            {
                "config": json.loads(key),
                "num_repeats": len(runs),
                "metrics": {
                    name: {
                        "mean": mean(values)
                        if len(values) == len(runs)
                        else None,
                        "stddev": pstdev(values)
                        if len(values) == len(runs)
                        else None,
                        "valid_repeats": len(values),
                    }
                    for name in (
                        "pipeline_fdr",
                        "pipeline_cc",
                        "pipeline_fc",
                        "sr_cpr",
                    )
                    for values in [
                        [
                            r["primary"][name]["value"]
                            for r in runs
                            if r["primary"][name]["value"] is not None
                        ]
                    ]
                },
            }
        )
    return {
        "schema_version": 1,
        "scoring_version": SCORING_VERSION,
        "benchmark_version": manifest["benchmark_version"],
        "manifest_sha256": identity(manifest),
        "sr_version_audit_sha256": identity(manifest["sr_version_audit"])
        if manifest.get("sr_version_audit")
        else None,
        "analysis_id": analysis.get("id"),
        "source_analysis_sha256": identity(analysis),
        "price_version": book.get("version"),
        "pricebook_sha256": identity(book),
        "policies": {
            "progression": "structure-cases",
            "strict_pass": "all_applicable_required_tests",
            "pipeline_final_completion": "manifest-defined final checkpoint only; 0 if verified not_reached or Structure not all passed; otherwise (Core passed + Regression passed) / (Core applicable + Regression applicable); equal task-chain weights; incomplete/invalid evidence remains unknown",
            "legacy_groups": "Functionality maps to Core exactly once for nodes, required IDs, evaluator totals and inventories; source evidence is unchanged; Error remains required for strict success",
            "test_group_aliases": {"Functionality": "Core"},
            "regression_na": "explicit collection inventory zero only",
            "timing": timing_policy,
            "timing_unit": "seconds",
            "currency": "USD",
            "cost": "selected valid trajectory, including failed executed checkpoints",
            "cache_scenarios": ["actual", "fixed_85"],
            "fixed_85": "85% of total prompt input at cache-read rate; 15% input rate; no cache-write charge; output unchanged",
            "core_pass_target_set": "all manifest checkpoints, not_reached contributes zero",
            "repeats": "each repeat separately; no best-of-k or cross-repeat filling",
            "protocol_equivalence": "only explicit manifest mappings after exact complete execution-settings hash verification; original protocol IDs retained",
            "sr_version_compatibility": "explicit audited per-SR frozen target and selected-evidence bindings; original decisions retained; unknown alone is never sufficient",
            "container_preparation_and_scheduling": "excluded; not recorded as zero",
        },
        "groups": reports,
        "repeat_statistics": repeated,
        "excluded_cells": rejected,
    }


def write_report(report: dict[str, Any], output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    (output / "summary.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    )
    tables: dict[str, list[dict[str, Any]]] = {
        "summary": [],
        "checkpoints": [],
        "chains": [],
    }
    for group in report["groups"]:
        base = {"group_id": group["id"], **group["config"]}
        tables["summary"].extend(
            {**base, "metric": name, **value}
            for name, value in {
                **group["primary"],
                **group["auxiliary"],
            }.items()
        )
        for kind, data in (
            ("resources", group["resources"]),
            ("efficiencies", group["efficiencies"]),
        ):
            tables["summary"].extend(
                {**base, "metric": name, "kind": kind, **value}
                for name, value in data.items()
            )
        tables["checkpoints"].extend(
            {**base, **row} for row in group["checkpoint_records"]
        )
        tables["chains"].extend({**base, **row} for row in group["chains"])
    for name, rows in tables.items():
        if not rows:
            continue
        fields = list(dict.fromkeys(k for row in rows for k in row))
        with (output / f"{name}.csv").open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fields)
            writer.writeheader()
            for row in rows:
                clean = {}
                for k, value in row.items():
                    if isinstance(value, (dict, list)):
                        value = json.dumps(
                            value, ensure_ascii=False, allow_nan=False
                        )
                    if isinstance(value, str) and value.startswith(
                        ("=", "+", "-", "@")
                    ):
                        value = "'" + value
                    clean[k] = value
                writer.writerow(clean)
    with (output / "checkpoints.jsonl").open("w") as stream:
        for row in tables["checkpoints"]:
            stream.write(
                json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--analysis", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--pricebook", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--timing-policy",
        choices=("agent_only", "agent_plus_evaluation"),
        default="agent_only",
    )
    args = parser.parse_args()

    def load(path):
        return json.loads(path.read_text())

    report = calculate(
        load(args.analysis),
        load(args.manifest),
        load(args.pricebook),
        timing_policy=args.timing_policy,
    )
    write_report(report, args.output)
    print(
        json.dumps(
            {
                "output": str(args.output),
                "scoring_version": SCORING_VERSION,
                "groups": len(report["groups"]),
            }
        )
    )


if __name__ == "__main__":
    main()
