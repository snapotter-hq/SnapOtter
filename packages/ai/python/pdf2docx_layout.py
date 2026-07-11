"""Targeted layout compatibility fixes for pdf2docx 0.5.13."""

from docx.enum.table import WD_ROW_HEIGHT
from docx.shared import Pt
from pdf2docx.common import constants
from pdf2docx.common.share import rgb_value
from pdf2docx.layout.Blocks import Blocks
from pdf2docx.table.Row import Row
from pdf2docx.table.TableBlock import TableBlock


_original_collect_stream_lines = Blocks.collect_stream_lines
_original_table_make_docx = TableBlock.make_docx
_original_row_make_docx = Row.make_docx
_installed = False


def _collect_stream_lines(
    self, potential_shadings, line_separate_threshold, **kwargs
):
    groups = _original_collect_stream_lines(
        self, potential_shadings, line_separate_threshold, **kwargs
    )
    fills = [
        shape
        for shape in potential_shadings
        if not shape.is_determined and shape.color != rgb_value((1, 1, 1))
    ]
    merged = []
    active_fill_ids = set()

    for group in groups:
        covered_fill_ids = {
            id(fill)
            for fill in fills
            if any(
                fill.contains(line, threshold=constants.FACTOR_MOST)
                for line in group
            )
        }
        if (
            merged
            and covered_fill_ids
            and active_fill_ids.intersection(covered_fill_ids)
        ):
            merged[-1].extend(group)
            active_fill_ids.update(covered_fill_ids)
        else:
            merged.append(group)
            active_fill_ids = covered_fill_ids

    return merged


def _make_table_docx(self, table):
    _original_table_make_docx(self, table)

    if not self.is_stream_table_block or self.num_cols != 1:
        return

    cells = [cell for row in self for cell in row if cell]
    if not cells or any(cell.bg_color is None for cell in cells):
        return

    table.columns[0].width = Pt(max(cell.bbox.width for cell in cells))


def _make_row_docx(self, table, idx_row):
    _original_row_make_docx(self, table, idx_row)

    if any(cell and cell.bg_color is not None for cell in self):
        table.rows[idx_row].height_rule = WD_ROW_HEIGHT.AT_LEAST


def install_pdf2docx_layout_fixes() -> None:
    """Install the pdf2docx layout compatibility wrappers exactly once."""
    global _installed

    if _installed:
        return

    Blocks.collect_stream_lines = _collect_stream_lines
    TableBlock.make_docx = _make_table_docx
    Row.make_docx = _make_row_docx
    _installed = True
