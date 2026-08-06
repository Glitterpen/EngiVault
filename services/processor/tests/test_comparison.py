from app.comparison import compare_units


def test_comparison_reports_changed_added_and_removed_units() -> None:
    base = [{"content": "Pressure 90 barg", "page_number": 1}, {"content": "Old note", "page_number": 2}]
    target = [{"content": "Pressure 95 barg", "page_number": 1}, {"content": "New note", "page_number": 3}, {"content": "Added", "page_number": 4}]
    summary, changes = compare_units(base, target)
    assert summary["changed"] == 2
    assert summary["added"] == 1
    assert changes[0]["locator"] == "Page 1"


def test_identical_revisions_have_no_changes() -> None:
    units = [{"content": "Same", "sheet_name": "Sheet1", "cell_range": "A1"}]
    summary, changes = compare_units(units, units)
    assert changes == []
    assert summary["unchanged_units"] >= 1
