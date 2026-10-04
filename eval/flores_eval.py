# /// script
# requires-python = ">=3.10"
# dependencies = ["sacrebleu>=2.4", "huggingface_hub>=0.25"]
# ///
"""Evaluación FLORES+ devtest para EN→ES y EN→QU (directa y pivote).

Pasos:
  1. uv run eval/flores_eval.py download   # requiere HF_TOKEN y aceptar los términos de
                                           # openlanguagedata/flores_plus en huggingface.co
  2. node eval/translate_flores.mjs 100    # traduce con el mismo modelo q8 de la app
  3. uv run eval/flores_eval.py score      # chrF por ruta + calibración de QU_THRESHOLD
"""

import json
import shutil
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data"
LANGS = ["eng_Latn", "spa_Latn", "quy_Latn"]


def download() -> None:
    from huggingface_hub import hf_hub_download

    DATA.mkdir(exist_ok=True)
    for lang in LANGS:
        path = hf_hub_download(
            "openlanguagedata/flores_plus", f"devtest/{lang}.jsonl", repo_type="dataset"
        )
        shutil.copy(path, DATA / f"{lang}.jsonl")
        print(f"→ eval/data/{lang}.jsonl")


def score() -> None:
    from sacrebleu.metrics import CHRF

    rows = [json.loads(l) for l in (HERE / "flores_outputs.jsonl").read_text().splitlines()]
    chrf = CHRF()

    def corpus(hyp_key: str, ref_key: str) -> float:
        return round(chrf.corpus_score([r[hyp_key] for r in rows], [[r[ref_key] for r in rows]]).score, 2)

    routes = {
        "eng-spa": corpus("hyp_spa", "ref_spa"),
        "eng-quy_direct": corpus("hyp_quy_direct", "ref_quy"),
        "eng-spa-quy_pivot": corpus("hyp_quy_pivot", "ref_quy"),
    }
    best = "direct" if routes["eng-quy_direct"] >= routes["eng-spa-quy_pivot"] else "pivot"

    # Calibración: ¿qué señal de retrotraducción predice mejor la calidad por frase?
    key = best
    sent_chrf = [chrf.sentence_score(r[f"hyp_quy_{key}"], [r["ref_quy"]]).score for r in rows]
    signals = {
        "e5_cosine": [r[f"sim_{key}"] for r in rows],
        "back_chrF": [chrf.sentence_score(r[f"back_spa_{key}"], [r["hyp_spa"]]).score / 100 for r in rows],
    }
    worst_cut = sorted(sent_chrf)[len(sent_chrf) // 4]
    bad = [c <= worst_cut for c in sent_chrf]

    def calibrate(values: list[float]) -> dict:
        # Umbral que mejor separa el cuartil con peor chrF (máximo F1 de "mala").
        best_t, best_f1 = None, -1.0
        for t in sorted({round(v, 2) for v in values}):
            flagged = [v < t for v in values]
            tp = sum(f and b for f, b in zip(flagged, bad))
            fp = sum(f and not b for f, b in zip(flagged, bad))
            fn = sum(b and not f for f, b in zip(flagged, bad))
            f1 = 2 * tp / (2 * tp + fp + fn) if tp else 0.0
            if f1 > best_f1:
                best_t, best_f1 = t, f1
        return {
            "pearson_vs_sentence_chrF": round(statistics.correlation(values, sent_chrf), 3),
            "suggested_threshold": best_t,
            "f1_flagging_worst_quartile": round(best_f1, 3),
            "share_hidden": round(sum(v < best_t for v in values) / len(values), 3),
        }

    confidence = {name: calibrate(vals) for name, vals in signals.items()}

    results = {
        "dataset": "openlanguagedata/flores_plus devtest",
        "n_sentences": len(rows),
        "model": "Xenova/nllb-200-distilled-600M (ONNX q8, transformers.js)",
        "confidence_model": "Xenova/multilingual-e5-small (ONNX q8)",
        "chrF": routes,
        "best_qu_route": best,
        "qu_confidence_signals": confidence,
    }
    (HERE / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    {"download": download, "score": score}[sys.argv[1] if len(sys.argv) > 1 else "score"]()
