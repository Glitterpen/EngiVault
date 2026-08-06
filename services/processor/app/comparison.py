from __future__ import annotations

from difflib import SequenceMatcher


def compare_units(base:list[dict[str,object]],target:list[dict[str,object]])->tuple[dict[str,object],list[dict[str,object]]]:
    left=[str(item.get("content", "")) for item in base];right=[str(item.get("content", "")) for item in target];matcher=SequenceMatcher(a=left,b=right,autojunk=False);changes:list[dict[str,object]]=[]
    for tag,i1,i2,j1,j2 in matcher.get_opcodes():
        if tag=="equal":continue
        count=max(i2-i1,j2-j1)
        for offset in range(count):
            old=base[i1+offset] if i1+offset<i2 else None;new=target[j1+offset] if j1+offset<j2 else None;kind="changed" if old and new else "removed" if old else "added";source=new or old or {};locator=_locator(source)
            changes.append({"ordinal":len(changes),"change_type":kind,"locator":locator,"base_content":old.get("content") if old else None,"target_content":new.get("content") if new else None})
    summary={"added":sum(c["change_type"]=="added" for c in changes),"removed":sum(c["change_type"]=="removed" for c in changes),"changed":sum(c["change_type"]=="changed" for c in changes),"unchanged_units":sum(block.size for block in matcher.get_matching_blocks())}
    return summary,changes[:2000]

def _locator(item:dict[str,object])->str:
    if item.get("page_number"):return f"Page {item['page_number']}"
    if item.get("paragraph_number"):return f"Paragraph {item['paragraph_number']}"
    return f"{item.get('sheet_name') or 'Sheet'} {item.get('cell_range') or ''}".strip()
