"""Tests for the pure helpers (no SDK needed): webhook parsing."""

import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from cloud_decision.github import (  # noqa: E402
    decode_contents_entry,
    normalize_direct_input,
    target_from_webhook,
)

LABEL_EVENT = {
    "method": "POST",
    "path": "/",
    "headers": {"x-github-event": "issues"},
    "body": {
        "action": "labeled",
        "label": {"name": "decision-request"},
        "issue": {
            "number": 47,
            "labels": [{"name": "decision-request"}, {"name": "triage"}],
        },
        "repository": {"full_name": "P-Bouche/home-energy-consumption-simulator"},
    },
}


def test_labeled_with_target_label_is_a_target():
    t = target_from_webhook(LABEL_EVENT)
    assert t == {
        "owner": "P-Bouche",
        "repo": "home-energy-consumption-simulator",
        "issue_number": 47,
    }


def test_labeled_with_another_label_is_ignored():
    event = {
        "body": {
            "action": "labeled",
            "label": {"name": "triage"},
            "issue": {"number": 47,
                      "labels": [{"name": "triage"}, {"name": "decision-request"}]},
            "repository": {"full_name": "a/b"},
        }
    }
    assert target_from_webhook(event) is None


def test_issue_without_label_is_ignored():
    event = {
        "body": {
            "action": "opened",
            "issue": {"number": 47, "labels": []},
            "repository": {"full_name": "a/b"},
        }
    }
    assert target_from_webhook(event) is None


def test_non_github_payload_is_ignored():
    assert target_from_webhook({"body": {"action": "x"}}) is None
    assert target_from_webhook({}) is None
    assert target_from_webhook(None) is None


def test_direct_input_validation():
    assert normalize_direct_input("a", "b", 47) == {
        "owner": "a", "repo": "b", "issue_number": 47}
    for bad in [("a", "", 1), ("", "b", 1), ("a", "b", 0), ("a", "b", -1)]:
        assert normalize_direct_input(*bad) is None


def test_decode_contents_entry():
    import base64
    entry = {
        "type": "file",
        "path": "src/main.ts",
        "content": base64.b64encode("const x = 1;".encode()).decode(),
    }
    d = decode_contents_entry(entry)
    assert d["text"] == "const x = 1;"
    assert decode_contents_entry({"type": "dir", "path": "src"}) == {
        "type": "dir", "path": "src"}
    assert decode_contents_entry("junk") is None
