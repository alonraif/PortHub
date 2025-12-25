const connectionForm = document.getElementById("connection-form");
const formTitle = document.getElementById("form-title");
const cancelEdit = document.getElementById("cancel-edit");
const portField = document.getElementById("port-field");
const foldersEl = document.getElementById("folders");
const folderSelect = document.getElementById("folder-select");
const newButton = document.getElementById("new-connection");
const newFolderButton = document.getElementById("new-folder");
const logoutButton = document.getElementById("logout");
const commandText = document.getElementById("command-text");
const copyCommand = document.getElementById("copy-command");
const commandHint = document.getElementById("command-hint");
const portModal = document.getElementById("port-modal");
const connectionModal = document.getElementById("connection-modal");
const portForm = document.getElementById("port-form");
const cancelPort = document.getElementById("cancel-port");

let currentConnections = [];
let currentFolders = [];
let pendingConnect = null;

function isFolderCollapsed(folderId) {
  const stored = localStorage.getItem(`folder:${folderId}:collapsed`);
  if (stored === null) return true;
  return stored === "true";
}

function setFolderCollapsed(folderId, isCollapsed) {
  localStorage.setItem(`folder:${folderId}:collapsed`, String(isCollapsed));
}

function defaultFolderId() {
  const unsorted = currentFolders.find((folder) => folder.name === "Unsorted");
  if (unsorted) return unsorted.id;
  return currentFolders[0]?.id || null;
}

function setFormMode(mode, data = null) {
  if (mode === "edit" && data) {
    formTitle.textContent = "Edit Connection";
    connectionForm.id.value = data.id;
    connectionForm.name.value = data.name;
    connectionForm.host.value = data.host;
    connectionForm.username.value = data.username;
    connectionForm.password.value = data.password || "";
    connectionForm.portIsDynamic.checked = data.portIsDynamic;
    connectionForm.port.value = data.port || "";
    connectionForm.folderId.value = data.folderId || defaultFolderId();
  } else {
    formTitle.textContent = "Add Connection";
    connectionForm.reset();
    connectionForm.id.value = "";
    connectionForm.folderId.value = defaultFolderId();
  }
  togglePortField();
}

function togglePortField() {
  const isDynamic = connectionForm.portIsDynamic.checked;
  portField.classList.toggle("hidden", isDynamic);
  connectionForm.port.required = !isDynamic;
}

function openFormModal() {
  connectionModal.classList.remove("hidden");
}

function closeFormModal() {
  connectionModal.classList.add("hidden");
}

function closePortModal() {
  portModal.classList.add("hidden");
  portForm.reset();
  pendingConnect = null;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Request failed");
  }
  return res.json();
}

async function loadData() {
  const [folders, connections] = await Promise.all([
    api("/api/folders"),
    api("/api/connections"),
  ]);
  currentFolders = folders;
  const fallbackId = defaultFolderId();
  currentConnections = connections.map((conn) => ({
    ...conn,
    folderId: conn.folderId || fallbackId,
  }));
  renderFolderSelect();
  renderConnections();
}

function renderFolderSelect() {
  folderSelect.innerHTML = "";
  currentFolders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    folderSelect.appendChild(option);
  });
}

function renderConnections() {
  foldersEl.innerHTML = "";
  if (!currentFolders.length) {
    foldersEl.innerHTML =
      '<div class="empty">No folders yet. Create one to get started.</div>';
    return;
  }

  currentFolders.forEach((folder) => {
    const folderConnections = currentConnections.filter(
      (conn) => conn.folderId === folder.id
    );
    if (folder.name === "Unsorted" && folderConnections.length === 0) {
      return;
    }
    const wrapper = document.createElement("section");
    wrapper.className = "folder-card";
    wrapper.dataset.folderId = folder.id;
    const collapsed = isFolderCollapsed(folder.id);
    wrapper.classList.toggle("collapsed", collapsed);
    wrapper.innerHTML = `
      <div class="folder-header">
        <div class="folder-meta">
          <button class="toggle-folder" data-folder-action="toggle" data-folder-id="${folder.id}" aria-label="Toggle folder">
            <span class="triangle ${collapsed ? "" : "expanded"}" aria-hidden="true"></span>
          </button>
          <div>
            <div class="folder-title">${folder.name}</div>
            <p class="muted">${folderConnections.length} connections</p>
          </div>
        </div>
        <div class="folder-actions">
          <button class="ghost" data-folder-action="rename" data-folder-id="${folder.id}" ${
            folder.name === "Unsorted" ? "disabled" : ""
          }>Rename</button>
          <button class="ghost" data-folder-action="delete" data-folder-id="${folder.id}" ${
            folder.name === "Unsorted" ? "disabled" : ""
          }>Delete</button>
        </div>
      </div>
      <div class="connection-list" data-folder-id="${folder.id}"></div>
    `;

    const listZone = wrapper.querySelector(".connection-list");
    if (!collapsed && folderConnections.length) {
      folderConnections.forEach((conn) => {
        const moveOptions = currentFolders
          .map(
            (folderOption) =>
              `<option value="${folderOption.id}" ${
                folderOption.id === conn.folderId ? "selected" : ""
              }>${folderOption.name}</option>`
          )
          .join("");
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.id = conn.id;
        card.innerHTML = `
          <div class="card-header">
            <h3>${conn.name}</h3>
            <span class="tag">${conn.portIsDynamic ? "Dynamic" : `Port ${conn.port}`}</span>
          </div>
          <p><strong>${conn.username}</strong>@${conn.host}</p>
          <div class="card-actions">
            <button class="primary" data-action="connect" data-id="${conn.id}">Copy SSH Command</button>
            <button class="ghost" data-action="copy" data-id="${conn.id}">Copy Password</button>
            <button class="ghost" data-action="move" data-id="${conn.id}">Move Folder</button>
            <select class="move-select hidden" data-action="move-select" data-id="${conn.id}">
              ${moveOptions}
            </select>
            <button class="ghost" data-action="edit" data-id="${conn.id}">Edit</button>
            <button class="ghost" data-action="delete" data-id="${conn.id}">Delete</button>
          </div>
        `;
        listZone.appendChild(card);
      });
    }

    foldersEl.appendChild(wrapper);
  });
}


connectionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(connectionForm));
  data.portIsDynamic = Boolean(connectionForm.portIsDynamic.checked);
  data.port = data.port ? Number(data.port) : null;

  try {
    if (data.id) {
      await api(`/api/connections/${data.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } else {
      await api("/api/connections", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    setFormMode("new");
    closeFormModal();
    await loadData();
  } catch (err) {
    alert(err.message);
  }
});

cancelEdit.addEventListener("click", () => {
  setFormMode("new");
  closeFormModal();
});

newButton.addEventListener("click", () => {
  setFormMode("new");
  openFormModal();
});

newFolderButton.addEventListener("click", async () => {
  const name = prompt("Folder name?");
  if (!name) return;
  try {
    await api("/api/folders", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    await loadData();
    setFormMode("new");
  } catch (err) {
    alert(err.message);
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.href = "/login";
});

foldersEl.addEventListener("click", async (event) => {
  const action = event.target.dataset.action;
  const folderActionEl = event.target.closest("[data-folder-action]");
  const folderAction = folderActionEl?.dataset.folderAction;
  if (folderAction) {
    const folderId = Number(folderActionEl.dataset.folderId);
    const folder = currentFolders.find((item) => item.id === folderId);
    if (!folder) return;
    if (folderAction === "rename") {
      const name = prompt("New folder name?", folder.name);
      if (!name) return;
      try {
        await api(`/api/folders/${folderId}`, {
          method: "PUT",
          body: JSON.stringify({ name }),
        });
        await loadData();
      } catch (err) {
        alert(err.message);
      }
    }
    if (folderAction === "delete") {
      if (confirm(`Delete folder "${folder.name}"? Connections move to Unsorted.`)) {
        try {
          await api(`/api/folders/${folderId}`, { method: "DELETE" });
          await loadData();
        } catch (err) {
          alert(err.message);
        }
      }
    }
    if (folderAction === "toggle") {
      const next = !isFolderCollapsed(folderId);
      if (!next) {
        currentFolders.forEach((item) => setFolderCollapsed(item.id, true));
      }
      setFolderCollapsed(folderId, next);
      await loadData();
    }
    return;
  }
  if (!action) return;
  const id = Number(event.target.dataset.id);
  const conn = currentConnections.find((item) => item.id === id);
  if (!conn) return;

  if (action === "move") {
    const card = event.target.closest(".card");
    if (!card) return;
    const select = card.querySelector(".move-select");
    if (!select) return;
    select.classList.toggle("hidden");
    if (!select.classList.contains("hidden")) {
      select.focus();
    }
    return;
  }

  if (action === "edit") {
    setFormMode("edit", conn);
    openFormModal();
    return;
  }

  if (action === "delete") {
    if (confirm(`Delete ${conn.name}?`)) {
      await api(`/api/connections/${conn.id}`, { method: "DELETE" });
      await loadData();
    }
    return;
  }

  if (action === "connect") {
    if (conn.portIsDynamic) {
      pendingConnect = conn;
      portModal.classList.remove("hidden");
      portForm.port.focus();
    } else {
      await connectWithPort(conn, conn.port);
    }
    return;
  }

  if (action === "copy") {
    await copyPasswordFor(conn);
  }
});

foldersEl.addEventListener("change", async (event) => {
  if (event.target.dataset.action !== "move-select") return;
  const id = Number(event.target.dataset.id);
  const targetFolderId = Number(event.target.value);
  if (!id || Number.isNaN(targetFolderId)) return;
  const conn = currentConnections.find((item) => item.id === id);
  if (!conn) return;
  try {
    await api(`/api/connections/${conn.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: conn.name,
        host: conn.host,
        username: conn.username,
        password: conn.password || "",
        portIsDynamic: conn.portIsDynamic,
        port: conn.port,
        folderId: targetFolderId,
      }),
    });
    event.target.classList.add("hidden");
    await loadData();
  } catch (err) {
    alert(err.message);
  }
});

async function connectWithPort(conn, port) {
  try {
    const data = await api(`/api/connections/${conn.id}/ssh?port=${port}`);
    commandText.textContent = data.sshCommand;
    const ok = await copyTextToClipboard(data.sshCommand);
    commandHint.textContent = ok
      ? "Command copied to clipboard."
      : "Copy failed. Select and copy manually.";
  } catch (err) {
    alert(err.message);
  }
}

async function copyPasswordFor(conn) {
  try {
    if (!conn.password) {
      alert("No password stored for this connection.");
      return;
    }
    const ok = await copyTextToClipboard(conn.password);
    commandText.textContent = ok
      ? "Password copied to clipboard."
      : "Copy failed. Password shown below.";
    commandHint.textContent = ok
      ? "Paste it into your SSH client when prompted."
      : conn.password;
  } catch (err) {
    alert(err.message);
  }
}

portForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const port = Number(portForm.port.value);
  if (!pendingConnect) return;
  const conn = pendingConnect;
  closePortModal();
  await connectWithPort(conn, port);
});

cancelPort.addEventListener("click", () => {
  closePortModal();
});

copyCommand.addEventListener("click", async () => {
  const text = commandText.textContent || "";
  if (!text || text.includes("Click connect")) return;
  const ok = await copyTextToClipboard(text);
  commandHint.textContent = ok
    ? "Command copied to clipboard."
    : "Copy failed. Select and copy manually.";
});

async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

connectionForm.portIsDynamic.addEventListener("change", togglePortField);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!connectionModal.classList.contains("hidden")) {
      closeFormModal();
    }
    if (!portModal.classList.contains("hidden")) {
      closePortModal();
    }
  }
});

connectionModal.addEventListener("click", (event) => {
  if (event.target === connectionModal) {
    closeFormModal();
  }
});

portModal.addEventListener("click", (event) => {
  if (event.target === portModal) {
    closePortModal();
  }
});

setFormMode("new");
loadData();
