async function loadInstances() {
  const metaEl = document.getElementById("meta");
  const errorEl = document.getElementById("error");
  const emptyEl = document.getElementById("empty");
  const tableEl = document.getElementById("table");
  const rowsEl = document.getElementById("rows");

  metaEl.textContent = "Loading...";

  try {
    const res = await fetch("/api/instances");
    const body = await res.json();

    if (!res.ok) {
      throw new Error(body.error || "An unknown error occurred.");
    }

    metaEl.textContent = `Project: ${body.projectId} · ${body.count} instance(s)`;

    if (body.count === 0) {
      emptyEl.style.display = "block";
      return;
    }

    tableEl.style.display = "table";
    rowsEl.innerHTML = body.instances
      .map(
        (i) => `
        <tr>
          <td>${escapeHtml(i.name)}</td>
          <td><span class="status status-${i.status}">${i.status}</span></td>
          <td>${escapeHtml(i.zone)}</td>
          <td>${escapeHtml(i.machineType)}</td>
          <td>${escapeHtml(i.privateIp ?? "—")}</td>
          <td>${escapeHtml(i.publicIp ?? "—")}</td>
        </tr>`,
      )
      .join("");
  } catch (err) {
    metaEl.textContent = "";
    errorEl.style.display = "block";
    errorEl.textContent = err.message;
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

loadInstances();
