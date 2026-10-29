
const money = (value) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(value);

const form = document.getElementById("depositForm");
const typeInput = document.getElementById("wasteType");
const weightInput = document.getElementById("weight");
const estimate = document.getElementById("estimate");
const notice = document.getElementById("notice");
const submitButton = document.getElementById("submitButton");

let tariffs = {};

function updateEstimate() {
    const type = typeInput.value;
    const weight = Number(weightInput.value);
    const price = tariffs[type]?.price ?? 0;

    estimate.textContent = money(
        Number.isFinite(weight) && weight > 0
            ? Math.round(weight * price)
            : 0
    );
}

function showNotice(message, kind = "") {
    notice.textContent = message;
    notice.className = `notice ${kind}`;
}

function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

async function loadDashboard() {
    try {
        const response = await fetch("http://127.0.0.1:10000/api/summary");
        if (!response.ok) throw new Error("Gagal mengambil data");

        const data = await response.json();

        document.getElementById("balance").textContent =
            money(data.balance);

        document.getElementById("totalDeposits").textContent =
            data.total_deposits;

        document.getElementById("totalWeight").textContent =
            `${Number(data.total_weight).toLocaleString("id-ID")} kg`;

        const historyBody = document.getElementById("historyBody");
        historyBody.replaceChildren();

        if (!data.deposits.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 5;
            cell.className = "empty";
            cell.textContent = "Belum ada setoran. Yuk, mulai setor sampah!";
            row.appendChild(cell);
            historyBody.appendChild(row);
            return;
        }

        for (const item of data.deposits) {
            const row = document.createElement("tr");

            const values = [
                item.id,
                item.name,
                `${Number(item.weight).toLocaleString("id-ID")} kg`,
                formatDate(item.date),
                money(item.amount)
            ];

            values.forEach((value, index) => {
                const cell = document.createElement("td");
                cell.textContent = value;

                if (index === 4) {
                    cell.className = "amount";
                }

                row.appendChild(cell);
            });

            historyBody.appendChild(row);
        }
    } catch (error) {
        showNotice(
            "Tidak bisa memuat data. Pastikan server Flask masih berjalan.",
            "error"
        );
    }
}

async function loadTariffs() {
    const response = await fetch("http://127.0.0.1:10000/api/tariffs");

    if (!response.ok) {
        throw new Error("Gagal memuat harga sampah");
    }

    tariffs = await response.json();
    updateEstimate();
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const weight = Number(weightInput.value);
    const type = typeInput.value;

    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
        showNotice("Masukkan berat di atas 0 dan maksimal 100 kg.", "error");
        return;
    }

    const requestId = crypto.randomUUID();

    submitButton.disabled = true;
    submitButton.textContent = "Menyimpan...";
    showNotice("");

    try {
        const response = await fetch("http://127.0.0.1:10000/api/deposits", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                type,
                weight,
                request_id: requestId
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Setoran gagal disimpan");
        }

        showNotice(
            `${result.message} Saldo masuk ${money(result.deposit.amount)}.`,
            "success"
        );

        weightInput.value = "";
        updateEstimate();
        await loadDashboard();
    } catch (error) {
        showNotice(error.message || "Terjadi kesalahan.", "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "+ Catat Setoran";
    }
});

typeInput.addEventListener("change", updateEstimate);
weightInput.addEventListener("input", updateEstimate);

document.getElementById("refreshButton").addEventListener(
    "click",
    loadDashboard
);

async function startApp() {
    try {
        await loadTariffs();
        await loadDashboard();
    } catch (error) {
        showNotice("Gagal terhubung ke API. Periksa server Flask.", "error");
    }
}

startApp();
