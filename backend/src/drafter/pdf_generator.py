"""
pdf_generator.py
Professional Court Document PDF Generator for Pakistani Courts
Produces LaTeX-quality formatting using ReportLab Platypus.
"""

import io
import re
from typing import Dict, List, Tuple, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate,
    Paragraph, Spacer, Table, TableStyle, KeepTogether,
)
from reportlab.platypus.flowables import Flowable
from reportlab.lib import colors


# ── Page Layout ───────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4                 # 595.28 x 841.89 pt
ML = 3.2 * cm                       # left margin (wider — court standard)
MR = 2.5 * cm
MT = 3.0 * cm
MB = 2.8 * cm
TW = PAGE_W - ML - MR              # usable text width

# ── Colors ────────────────────────────────────────────────────────────────────
C_BK = colors.HexColor('#000000')
C_DK = colors.HexColor('#111111')   # near-black for body
C_MD = colors.HexColor('#333333')   # medium for sub-lines

# ── Fonts (ReportLab built-ins — no TTF needed) ───────────────────────────────
F_R  = 'Times-Roman'
F_B  = 'Times-Bold'
F_I  = 'Times-Italic'
F_BI = 'Times-BoldItalic'
SZ   = 11.5     # body font size
SZ_H = 13.0     # court name size


# ── Custom Flowables ──────────────────────────────────────────────────────────

class DoubleLine(Flowable):
    """Classic legal document thick+thin double rule."""
    def __init__(self, width: float = TW, color=C_BK):
        super().__init__()
        self.width  = width
        self.color  = color
        self.height = 11

    def draw(self):
        c = self.canv
        c.setStrokeColor(self.color)
        c.setLineWidth(1.8)
        c.line(0, 9, self.width, 9)
        c.setLineWidth(0.6)
        c.line(0, 5, self.width, 5)


class ThinLine(Flowable):
    """Single thin horizontal rule."""
    def __init__(self, width: float = TW, lw: float = 0.75, color=C_BK):
        super().__init__()
        self.width  = width
        self.lw     = lw
        self.color  = color
        self.height = 8

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.lw)
        self.canv.line(0, 4, self.width, 4)


# ── Footer (page numbers) ─────────────────────────────────────────────────────

def _page_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(F_R, 9)
    canvas.setFillColor(C_MD)
    page_n = canvas.getPageNumber()
    canvas.drawCentredString(PAGE_W / 2.0, MB * 0.38, f"— {page_n} —")
    canvas.restoreState()


# ── Style Factory ─────────────────────────────────────────────────────────────

def _build_styles() -> Dict[str, ParagraphStyle]:
    """Build all paragraph styles."""
    def S(name, **kw):
        base = dict(fontName=F_R, fontSize=SZ, leading=20,
                    alignment=TA_JUSTIFY, textColor=C_DK,
                    spaceBefore=3, spaceAfter=3)
        base.update(kw)
        return ParagraphStyle(name, **base)

    return {
        # ── Header block ──
        'court': S('court',
                   fontName=F_B, fontSize=SZ_H, leading=22,
                   alignment=TA_CENTER, textColor=C_BK,
                   spaceBefore=0, spaceAfter=4),

        'case_no': S('case_no',
                     fontSize=11, leading=17,
                     alignment=TA_CENTER, textColor=C_DK,
                     spaceBefore=1, spaceAfter=1),

        'under': S('under',
                   fontName=F_I, fontSize=10.5, leading=16,
                   alignment=TA_CENTER, textColor=C_MD,
                   spaceBefore=1, spaceAfter=1),

        'pet_title': S('pet_title',
                       fontName=F_B, fontSize=12.5, leading=19,
                       alignment=TA_CENTER, textColor=C_BK,
                       spaceBefore=5, spaceAfter=5),

        # ── Parties table ──
        'pty_l': S('pty_l', alignment=TA_LEFT,  spaceBefore=2, spaceAfter=2),
        'pty_r': S('pty_r', alignment=TA_RIGHT, spaceBefore=2, spaceAfter=2),
        'versus': S('versus',
                    fontName=F_B, fontSize=SZ, leading=17,
                    alignment=TA_CENTER, spaceBefore=6, spaceAfter=6),

        # ── Section headings ──
        'sec_head': S('sec_head',
                      fontName=F_B, fontSize=12, leading=18,
                      alignment=TA_CENTER, textColor=C_BK,
                      spaceBefore=16, spaceAfter=10),

        'sheweth': S('sheweth',
                     fontName=F_I, fontSize=11.5, leading=17,
                     alignment=TA_CENTER, textColor=C_DK,
                     spaceBefore=8, spaceAfter=8),

        # ── Body content ──
        'body': S('body', spaceBefore=4, spaceAfter=4),

        'fact': S('fact',
                  firstLineIndent=0, spaceBefore=6, spaceAfter=6),

        'ground': S('ground',
                    leftIndent=30, firstLineIndent=-30,
                    spaceBefore=7, spaceAfter=7),

        'prayer_intro': S('prayer_intro',
                          fontName=F_I, spaceBefore=4, spaceAfter=6),

        'prayer_item': S('prayer_item',
                         leftIndent=30, firstLineIndent=-30,
                         spaceBefore=5, spaceAfter=5),

        'verif': S('verif', spaceBefore=4, spaceAfter=4),

        'sig': S('sig', alignment=TA_LEFT,
                 spaceBefore=2, spaceAfter=2),
    }


# ── Text Parsing ──────────────────────────────────────────────────────────────

# Patterns for section delimiters in the LLM output
_SEC_PAT = {
    'sheweth':  re.compile(r'\n\s*MOST\s+RESPECTFULLY\s+SHEWETH[:\s]*\n', re.I),
    'facts':    re.compile(r'\n\s*FACTS\s*\n',                             re.I),
    'grounds':  re.compile(r'\n\s*GROUNDS\s*\n',                           re.I),
    'prayer':   re.compile(r'\n\s*PRAYER\s*\n',                            re.I),
    'interim':  re.compile(r'\n\s*INTERIM[\s/\w]*?PRAYER\s*\n',            re.I),
    'verif':    re.compile(r'\n\s*VERIFICATION\s*\n',                      re.I),
}

_ALL_KEYS = ['sheweth', 'facts', 'grounds', 'prayer', 'interim', 'verif']


def _clean_text(text: str) -> str:
    """Strip decorative characters from LLM output."""
    text = re.sub(r'[═─]{4,}', '', text)
    text = re.sub(r'\*{3,}', '',  text)
    text = re.sub(r'\n{4,}', '\n\n\n', text)
    return text.strip()


def _split_sections(text: str) -> Dict[str, str]:
    """
    Locate section boundaries and return a dict of section texts.
    Sections: header | sheweth | facts | grounds | prayer | interim | verif
    """
    text = _clean_text(text)
    out  = {k: '' for k in ['header'] + _ALL_KEYS}

    # Find first position of each section marker
    cuts: List[Tuple[str, int, int]] = []    # (key, match_start, match_end)
    for key, pat in _SEC_PAT.items():
        m = pat.search(text)
        if m:
            cuts.append((key, m.start(), m.end()))

    if not cuts:
        out['header'] = text
        return out

    cuts.sort(key=lambda x: x[1])

    out['header'] = text[:cuts[0][1]].strip()

    for i, (key, _, end) in enumerate(cuts):
        next_start = cuts[i + 1][1] if i + 1 < len(cuts) else len(text)
        out[key] = text[end:next_start].strip()

    return out


def _parse_parties(header_text: str) -> Tuple[List[str], List[str]]:
    """
    Extract petitioner and respondent name lines from the header block.
    Returns (petitioner_lines, respondent_lines).
    """
    petitioner: List[str] = []
    respondent: List[str] = []
    in_resp = False

    for raw in header_text.split('\n'):
        line = raw.strip()
        if not line:
            continue

        # Petitioner tag
        if re.search(r'\.{3}\s*(?:petitioner|applicant)', line, re.I):
            name = re.sub(r'\s*\.{3}\s*(?:petitioner|applicant)\s*$', '',
                          line, flags=re.I).strip()
            if name:
                petitioner.append(name)
            in_resp = False
            continue

        # Respondent tag
        if re.search(r'\.{3}\s*respondents?', line, re.I):
            name = re.sub(r'\s*\.{3}\s*respondents?\s*$', '',
                          line, flags=re.I).strip()
            if name:
                respondent.append(name)
            in_resp = True
            continue

        # Versus separator
        if re.fullmatch(r'versus|vs?\.?', line, re.I):
            in_resp = True
            continue

        # Accumulate party lines
        if in_resp:
            respondent.append(line)
        elif petitioner:
            petitioner.append(line)

    return petitioner, respondent


def _parse_header_meta(header_text: str) -> Dict[str, str]:
    """
    Extract court name, case number lines, article clause, petition title
    from the header block.
    """
    meta = dict(court='', case_no='', under='', title='')
    for line in header_text.split('\n'):
        ln = line.strip()
        if not ln:
            continue
        if re.match(r'IN THE\s+(?:HIGH COURT|COURT)', ln, re.I):
            meta['court'] = ln
        elif re.match(r'(?:Writ Petition|Crl\. Misc|Constitution Petition)', ln, re.I):
            meta['case_no'] = ln
        elif re.match(r'(?:Under|Read with)', ln, re.I):
            meta['under'] = (meta['under'] + ' ' + ln).strip()
        elif re.match(
            r'^(?:HABEAS CORPUS|PRE-ARREST BAIL|POST-ARREST BAIL|'
            r'CONSTITUTIONAL PETITION|APPLICATION FOR|QUASHMENT)', ln, re.I
        ) and '...' not in ln:
            meta['title'] = ln
    return meta


# ── Section Renderers ─────────────────────────────────────────────────────────

def _render_facts(text: str, S: Dict) -> List:
    """Render FACTS paragraphs (each "That…" paragraph separately)."""
    items = []
    for para in re.split(r'\n{2,}', text):
        para = para.strip()
        if para:
            items.append(Paragraph(para, S['fact']))
    return items


def _render_grounds(text: str, S: Dict) -> List:
    """Render lettered GROUNDS with bold label and hanging indent."""
    items = []
    for para in re.split(r'\n{2,}', text):
        para = para.strip()
        if not para:
            continue
        # Bold the "A. " / "B. " label
        m = re.match(r'^([A-Z]\.\s+)(.*)', para, re.DOTALL)
        if m:
            para = f'<b>{m.group(1)}</b>{m.group(2)}'
        items.append(Paragraph(para, S['ground']))
    return items


def _render_prayer(text: str, S: Dict) -> List:
    """Render PRAYER / INTERIM PRAYER with numbered items."""
    items  = []
    intro  = []
    current_item: List[str] = []
    in_items = False

    for raw in text.split('\n'):
        ln = raw.strip()
        if not ln:
            if current_item:
                items.append(' '.join(current_item))
                current_item = []
            continue
        # Detect item markers: i. ii. 1. (i) (1) a.
        if re.match(r'^(?:[ivxlIVXL]+\.|[0-9]+\.|[a-z]\.|'
                    r'[\(\[](?:[ivx]+|[0-9]+|[a-z])[\)\]])', ln):
            if current_item:
                items.append(' '.join(current_item))
            current_item = [ln]
            in_items = True
        elif in_items:
            current_item.append(ln)
        else:
            intro.append(ln)

    if current_item:
        items.append(' '.join(current_item))

    flowables = []
    if intro:
        flowables.append(Paragraph(' '.join(intro), S['prayer_intro']))
    for it in items:
        flowables.append(Paragraph(it, S['prayer_item']))
    return flowables


def _render_verification(text: str, S: Dict) -> List:
    """Render VERIFICATION block with a two-column signature table."""
    body_lines: List[str] = []
    deponent:   List[str] = []
    counsel:    List[str] = []
    in_deponent = False
    in_counsel  = False

    for raw in text.split('\n'):
        ln = raw.strip()
        if not ln:
            continue
        if re.match(r'_{3,}', ln):
            # Underscored line: start of a signature block
            if not in_deponent and not in_counsel:
                in_deponent = True
                deponent.append(ln)
            elif in_deponent and not in_counsel:
                in_deponent = False
                in_counsel  = True
                counsel.append(ln)
            else:
                counsel.append(ln)
            continue
        if re.match(r'Through Counsel', ln, re.I):
            in_deponent = False
            in_counsel  = True
            counsel.append(ln)
            continue
        if in_counsel:
            counsel.append(ln)
        elif in_deponent:
            deponent.append(ln)
        else:
            body_lines.append(ln)

    flowables = []
    for bl in body_lines:
        flowables.append(Paragraph(bl, S['verif']))

    if deponent or counsel:
        flowables.append(Spacer(1, 18))
        left  = '<br/>'.join(deponent) if deponent else ''
        right = '<br/>'.join(counsel)  if counsel  else ''
        sig_t = Table(
            [[Paragraph(left,  S['sig']),
              Paragraph(right, S['sig'])]],
            colWidths=[TW * 0.5, TW * 0.5]
        )
        sig_t.setStyle(TableStyle([
            ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING',    (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('LEFTPADDING',   (0, 0), (-1, -1), 0),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
        ]))
        flowables.append(sig_t)

    return flowables


# ── Party Table ───────────────────────────────────────────────────────────────

def _party_table(petitioner: List[str], respondent: List[str],
                 S: Dict) -> Table:
    """Build the petitioner ↔ respondent two-column table."""
    rows = []

    for j, ln in enumerate(petitioner):
        tag = '...Petitioner' if j == len(petitioner) - 1 else ''
        rows.append([Paragraph(ln, S['pty_l']),
                     Paragraph(f'<i>{tag}</i>', S['pty_r'])])

    rows.append([Paragraph('<b>VERSUS</b>', S['versus']),
                 Paragraph('', S['pty_l'])])

    for j, ln in enumerate(respondent):
        tag = '...Respondents' if j == len(respondent) - 1 else ''
        rows.append([Paragraph(ln, S['pty_l']),
                     Paragraph(f'<i>{tag}</i>', S['pty_r'])])

    t = Table(rows, colWidths=[TW * 0.72, TW * 0.28])
    t.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
    ]))
    return t


# ── Main Entry Point ──────────────────────────────────────────────────────────

def generate_petition_pdf(petition_text: str) -> bytes:
    """
    Convert plain-text petition (as generated by the drafter LLM) into a
    professional, court-ready A4 PDF.

    Returns raw PDF bytes.
    """
    buf = io.BytesIO()
    S   = _build_styles()
    sec = _split_sections(petition_text)
    meta = _parse_header_meta(sec['header'])
    petitioner, respondent = _parse_parties(sec['header'])

    story: List = []

    # ── 1. Opening double rule + court name ───────────────────────────────────
    story.append(DoubleLine(TW))
    story.append(Spacer(1, 6))

    if meta['court']:
        story.append(Paragraph(meta['court'], S['court']))
    else:
        story.append(Paragraph('IN THE HIGH COURT OF SINDH AT KARACHI', S['court']))

    story.append(Spacer(1, 5))

    if meta['case_no']:
        story.append(Paragraph(meta['case_no'], S['case_no']))
    if meta['under']:
        for ln in meta['under'].split('  '):
            if ln.strip():
                story.append(Paragraph(ln.strip(), S['under']))

    story.append(Spacer(1, 8))

    # ── 2. Party block ────────────────────────────────────────────────────────
    story.append(ThinLine(TW))
    story.append(Spacer(1, 6))

    if petitioner or respondent:
        story.append(_party_table(
            petitioner or ['The Petitioner'],
            respondent or ['The Respondent'],
            S,
        ))
    story.append(Spacer(1, 6))
    story.append(ThinLine(TW))

    # ── 3. Petition title ─────────────────────────────────────────────────────
    if meta['title']:
        story.append(Spacer(1, 5))
        story.append(Paragraph(meta['title'], S['pet_title']))
        story.append(ThinLine(TW))

    # ── 4. Most Respectfully Sheweth ─────────────────────────────────────────
    story.append(Spacer(1, 5))
    story.append(Paragraph('MOST RESPECTFULLY SHEWETH:', S['sheweth']))
    story.append(ThinLine(TW))

    # ── 5. FACTS ─────────────────────────────────────────────────────────────
    if sec['facts']:
        story.append(Paragraph('FACTS', S['sec_head']))
        story.append(ThinLine(TW, lw=0.5))
        story.append(Spacer(1, 4))
        story.extend(_render_facts(sec['facts'], S))

    # ── 6. GROUNDS ───────────────────────────────────────────────────────────
    if sec['grounds']:
        story.append(Spacer(1, 6))
        story.append(ThinLine(TW))
        story.append(Paragraph('GROUNDS', S['sec_head']))
        story.append(ThinLine(TW, lw=0.5))
        story.append(Spacer(1, 4))
        story.extend(_render_grounds(sec['grounds'], S))

    # ── 7. PRAYER ────────────────────────────────────────────────────────────
    if sec['prayer']:
        story.append(Spacer(1, 6))
        story.append(ThinLine(TW))
        story.append(Paragraph('PRAYER', S['sec_head']))
        story.append(ThinLine(TW, lw=0.5))
        story.append(Spacer(1, 4))
        story.extend(_render_prayer(sec['prayer'], S))

    # ── 8. INTERIM / URGENT PRAYER ───────────────────────────────────────────
    if sec['interim']:
        story.append(Spacer(1, 6))
        story.append(ThinLine(TW))
        story.append(Paragraph('INTERIM / URGENT PRAYER', S['sec_head']))
        story.append(ThinLine(TW, lw=0.5))
        story.append(Spacer(1, 4))
        story.extend(_render_prayer(sec['interim'], S))

    # ── 9. VERIFICATION ──────────────────────────────────────────────────────
    if sec['verif']:
        story.append(Spacer(1, 8))
        story.append(ThinLine(TW))
        story.append(Paragraph('VERIFICATION', S['sec_head']))
        story.append(ThinLine(TW, lw=0.5))
        story.append(Spacer(1, 6))
        story.extend(_render_verification(sec['verif'], S))

    # Closing rule
    story.append(Spacer(1, 10))
    story.append(DoubleLine(TW))

    # ── Build PDF ─────────────────────────────────────────────────────────────
    frame    = Frame(ML, MB, TW, PAGE_H - MT - MB, id='main', showBoundary=0)
    template = PageTemplate(id='court', frames=[frame], onPage=_page_footer)

    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=ML, rightMargin=MR,
        topMargin=MT,  bottomMargin=MB,
        title='Court Petition — Legal Sahara',
        author='Legal Sahara AI',
    )
    doc.addPageTemplates([template])
    doc.build(story)

    return buf.getvalue()
