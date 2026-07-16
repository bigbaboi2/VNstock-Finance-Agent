from docling.document_converter import DocumentConverter
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.datamodel.base_models import InputFormat
from docling.document_converter import PdfFormatOption
import os

def build_converter(mode: str) -> DocumentConverter:
    pipeline_options = PdfPipelineOptions()

    if mode == "turbo":
        pipeline_options.do_ocr = False
        pipeline_options.do_table_structure = False

    elif mode == "fast":
        pipeline_options.do_ocr = False
        pipeline_options.do_table_structure = True
        pipeline_options.table_structure_options.mode = TableFormerMode.FAST
        pipeline_options.table_structure_options.do_cell_matching = False

    elif mode == "balanced":
        pipeline_options.do_ocr = False
        pipeline_options.do_table_structure = True
        pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE
        pipeline_options.table_structure_options.do_cell_matching = True

    else:
        pipeline_options.do_ocr = True
        pipeline_options.do_table_structure = True
        pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE

    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )