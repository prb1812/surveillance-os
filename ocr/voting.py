"""Plate text normalisation, Indian-format correction and multi-frame voting."""
import re
from collections import defaultdict
from dataclasses import dataclass

# Standard Indian plate: state (2 letters), district (1-2 digits),
# series (1-3 letters), number (4 digits). e.g. MH18AB1234, DL1CO5334
PLATE_REGEX = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$")

STATE_CODES = set(
    "AN AP AR AS BR CG CH DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP "
    "MZ NL OD OR PB PY RJ SK TG TN TR TS UK UP WB".split()
)

# Optional: if a state code is invalid and ONE character away from one of
# these, fix it. Leave empty to only fix visually-similar characters.
# Example for a camera in Delhi: {"DL", "HR", "UP"}
PREFERRED_STATES = set()

# Characters OCR commonly confuses with each other
SIMILAR_GROUPS = ["O0QD", "I1L", "S5", "Z2", "B8", "G6", "MNH", "UV", "CG"]

TO_DIGIT = {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1",
            "Z": "2", "S": "5", "B": "8", "G": "6", "T": "7"}
TO_LETTER = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G"}


def normalize_plate(text: str) -> str:
    """Uppercase and strip everything that is not A-Z or 0-9."""
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def _char_cost(a, b):
    if a == b:
        return 0.0
    if any(a in g and b in g for g in SIMILAR_GROUPS):
        return 0.5
    return 1.0


def _fix_state(s):
    """Return (state_code, cost). Fixes only near-miss state codes."""
    if s in STATE_CODES:
        return s, 0.0
    scored = sorted(
        (_char_cost(s[0], c[0]) + _char_cost(s[1], c[1]), c)
        for c in STATE_CODES
    )
    cost, code = scored[0]
    if cost <= 0.5:                       # one visually-similar character
        return code, cost
    for cost, code in scored:
        if cost <= 1.0 and code in PREFERRED_STATES:
            return code, cost
    return s, 1.5                         # leave as is, penalise


def _type_fix(ch, kind):
    """Force a char to the expected type (D=digit, L=letter) if possible."""
    if kind == "D":
        if ch.isdigit():
            return ch, 0.0
        if ch in TO_DIGIT:
            return TO_DIGIT[ch], 0.5
        return ch, 2.0
    if ch.isalpha():
        return ch, 0.0
    if ch in TO_LETTER:
        return TO_LETTER[ch], 0.5
    return ch, 2.0


def correct_indian(text: str) -> str:
    """Try every valid layout (district 1-2 digits, series 1-3 letters)
    and keep the one that needs the fewest character corrections."""
    n = len(text)
    if n < 8 or n > 11:
        return text
    best_cost, best_text = None, text
    for d in (2, 1):
        s = n - 6 - d
        if s < 1 or s > 3:
            continue
        kinds = "LL" + "D" * d + "L" * s + "DDDD"
        chars, cost = [], 0.0
        for ch, k in zip(text, kinds):
            c, x = _type_fix(ch, k)
            chars.append(c)
            cost += x
        state, sc = _fix_state("".join(chars[:2]))
        chars[:2] = list(state)
        cost += sc
        if best_cost is None or cost < best_cost:
            best_cost, best_text = cost, "".join(chars)
    return best_text


def clean_read(raw: str) -> str:
    return correct_indian(normalize_plate(raw))


def is_valid(text: str) -> bool:
    return bool(PLATE_REGEX.match(text)) and text[:2] in STATE_CODES


@dataclass
class PlateResult:
    text: str
    confidence: float   # mean OCR confidence of reads that agree on length
    agreement: float    # 0-1, how consistently characters agreed across reads
    n_reads: int
    valid: bool


def classify(res: PlateResult) -> str:
    """CONFIRMED / LIKELY / UNCERTAIN - how far to trust a result."""
    if res.valid and res.n_reads >= 3 and res.agreement >= 0.8 \
            and res.confidence >= 0.35:
        return "CONFIRMED"
    if res.valid and (res.n_reads >= 2 or res.confidence >= 0.5):
        return "LIKELY"
    return "UNCERTAIN"


class PlateVoter:
    """Collects OCR readings per track ID and returns a voted result."""

    def __init__(self, max_reads=12, finalize_reads=5, finalize_agreement=0.8):
        self.max_reads = max_reads
        self.finalize_reads = finalize_reads
        self.finalize_agreement = finalize_agreement
        self.reads = defaultdict(list)      # track_id -> [(text, conf)]
        self.best_crop = {}                 # track_id -> (quality, crop)

    def add(self, track_id, text, conf, crop=None, quality=0.0):
        if not text:
            return
        self.reads[track_id].append((text, float(conf)))
        if crop is not None:
            prev = self.best_crop.get(track_id)
            if prev is None or quality > prev[0]:
                self.best_crop[track_id] = (quality, crop)

    def result(self, track_id):
        reads = self.reads.get(track_id)
        if not reads:
            return None

        # 1) vote on plate length. Squaring the confidence lets a few
        #    confident reads beat many weak ones.
        len_weight = defaultdict(float)
        for t, c in reads:
            len_weight[len(t)] += c * c
        length = max(len_weight, key=len_weight.get)
        same = [(t, c) for t, c in reads if len(t) == length]

        # 2) vote on each character position
        chars, agreements = [], []
        for i in range(length):
            w = defaultdict(float)
            for t, c in same:
                w[t[i]] += c * c
            best = max(w, key=w.get)
            chars.append(best)
            agreements.append(w[best] / sum(w.values()))

        text = correct_indian("".join(chars))
        return PlateResult(
            text=text,
            confidence=sum(c for _, c in same) / len(same),
            agreement=sum(agreements) / length,
            n_reads=len(reads),
            valid=is_valid(text),
        )

    def is_final(self, track_id):
        n = len(self.reads.get(track_id, []))
        if n >= self.max_reads:
            return True
        if n < self.finalize_reads:
            return False
        res = self.result(track_id)
        return res.valid and res.agreement >= self.finalize_agreement