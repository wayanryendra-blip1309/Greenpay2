
from flask import Flask, render_template, request, jsonify
from pathlib import Path
from datetime import datetime
import json
import threading
import uuid

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data.json"
LOCK = threading.Lock()

TARIFFS = {
    "plastik": {"name": "Botol Plastik", "price": 500},
    "aluminium": {"name": "Kaleng Aluminium", "price": 1000},
    "kaca": {"name": "Botol Kaca", "price": 300},
}


def initial_data():
    return {
        "balance": 0,
        "deposits": [],
        "processed_keys": []
    }


def load_data():
    if not DATA_FILE.exists():
        save_data(initial_data())

    try:
        with open(DATA_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
    except (json.JSONDecodeError, OSError):
        data = initial_data()
        save_data(data)

    data.setdefault("balance", 0)
    data.setdefault("deposits", [])
    data.setdefault("processed_keys", [])
    return data


def save_data(data):
    temp_file = DATA_FILE.with_suffix(".tmp")
    with open(temp_file, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2, ensure_ascii=False)
    temp_file.replace(DATA_FILE)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "app": "GreenPay Lite",
        "message": "API berjalan"
    })


@app.get("/api/tariffs")
def tariffs():
    return jsonify(TARIFFS)


@app.get("/api/summary")
def summary():
    with LOCK:
        data = load_data()
        return jsonify({
            "balance": data["balance"],
            "total_deposits": len(data["deposits"]),
            "total_weight": round(
                sum(item["weight"] for item in data["deposits"]), 2
            ),
            "deposits": data["deposits"][:50]
        })


@app.get("/api/deposits")
def get_deposits():
    with LOCK:
        data = load_data()
        return jsonify(data["deposits"][:50])


@app.post("/api/deposits")
def create_deposit():
    body = request.get_json(silent=True) or {}

    waste_type = str(body.get("type", "")).lower().strip()

    try:
        weight = float(body.get("weight", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Berat harus berupa angka."}), 400

    if waste_type not in TARIFFS:
        return jsonify({"error": "Jenis sampah tidak tersedia."}), 400

    if not 0 < weight <= 100:
        return jsonify({
            "error": "Berat harus lebih dari 0 dan maksimal 100 kg."
        }), 400

    # Kunci unik mencegah pengiriman ulang permintaan yang sama.
    idempotency_key = str(body.get("request_id", "")).strip()
    if not idempotency_key or len(idempotency_key) > 100:
        return jsonify({
            "error": "request_id wajib diisi."
        }), 400

    with LOCK:
        data = load_data()

        for item in data["deposits"]:
            if item.get("request_id") == idempotency_key:
                return jsonify({
                    "message": "Setoran ini sudah tercatat.",
                    "deposit": item,
                    "balance": data["balance"]
                }), 200

        tariff = TARIFFS[waste_type]
        amount = round(weight * tariff["price"])

        deposit = {
            "id": uuid.uuid4().hex[:8].upper(),
            "request_id": idempotency_key,
            "type": waste_type,
            "name": tariff["name"],
            "weight": weight,
            "price_per_kg": tariff["price"],
            "amount": amount,
            "date": datetime.now().astimezone().isoformat(
                timespec="seconds"
            )
        }

        data["balance"] += amount
        data["deposits"].insert(0, deposit)
        data["deposits"] = data["deposits"][:500]
        data["processed_keys"] = [
            item["request_id"] for item in data["deposits"]
        ]

        save_data(data)

        return jsonify({
            "message": "Setoran berhasil dicatat.",
            "deposit": deposit,
            "balance": data["balance"]
        }), 201


import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=False)
