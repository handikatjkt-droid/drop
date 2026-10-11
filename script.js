
/* =====================================
   DROPZONE — SCRIPT.JS
   ===================================== */

// 1. KONFIGURASI SUPABASE
const SUPABASE_URL = "https://jzwdtczhbsrptqukmzjp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "PASTE_SB_PUBLISHABLE_KEY_DI_SINI";

const BUCKET = "drop-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

// 2. AMBIL ELEMEN HTML
const $ = id => document.getElementById(id);

const dropZone = $("drop-zone");
const fileInput = $("file-input");
const chooseBtn = $("choose-file");
const selectedPanel = $("selected-file");
const selectedName = $("selected-name");
const selectedSize = $("selected-size");
const removeBtn = $("remove-file");
const uploadBtn = $("upload-btn");
const uploadMessage = $("upload-message");

const currentName = $("current-name");
const currentDetails = $("current-details");
const downloadBtn = $("download-btn");
const downloadMessage = $("download-message");
const refreshBtn = $("refresh-btn");

const ownerPanel = $("owner-panel");
const loginForm = $("login-form");
const ownerEmail = $("owner-email");
const ownerPassword = $("owner-password");
const ownerSession = $("owner-session");
const ownerEmailDisplay = $("owner-email-display");
const logoutBtn = $("logout-btn");
const authMessage = $("auth-message");

let selectedFile = null;
let busy = false;

// 3. FUNGSI BANTUAN
function message(element, text, type = "") {
  element.textContent = text;
  element.dataset.type = type;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) {
    return (bytes / 1024).toFixed(1) + " KB";
  }
  return (bytes / 1048576).toFixed(2) + " MB";
}

function cleanName(name) {
  return name
    .split(/[\\/]/).pop()
    .replace(/[\u0000-\u001F\u007F]/g, "_")
    .slice(0, 180) || "download";
}

function setBusy(value) {
  busy = value;
  uploadBtn.disabled = value || !selectedFile;
  refreshBtn.disabled = value;
  chooseBtn.disabled = value;
  removeBtn.disabled = value;
  uploadBtn.textContent = value ? "Memproses..." : "Upload file";
}

// 4. PILIH FILE DAN DRAG & DROP
function selectFile(file) {
  if (!file) return;

  if (file.size > MAX_FILE_SIZE) {
    message(uploadMessage, "Ukuran maksimal file adalah 50 MB.", "error");
    return;
  }

  selectedFile = file;
  selectedName.textContent = cleanName(file.name);
  selectedSize.textContent = formatSize(file.size);
  selectedPanel.hidden = false;
  uploadBtn.disabled = busy;

  message(uploadMessage, "File siap di-upload.");
}

function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  selectedPanel.hidden = true;
  uploadBtn.disabled = true;
  message(uploadMessage, "Pilih file yang ingin di-upload.");
}

chooseBtn.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("click", event => {
  if (!event.target.closest("button")) fileInput.click();
});

dropZone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  selectFile(fileInput.files[0]);
});

["dragenter", "dragover"].forEach(type => {
  dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach(type => {
  dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
  });
});

dropZone.addEventListener("drop", event => {
  selectFile(event.dataTransfer.files[0]);
});

removeBtn.addEventListener("click", clearFile);

// 5. LOGIN PEMILIK
async function getSession() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  return data.session;
}

function renderSession(session) {
  ownerSession.hidden = !session;
  loginForm.hidden = !!session;

  ownerEmailDisplay.textContent = session
    ? "Login sebagai " + session.user.email
    : "";

  uploadBtn.disabled = busy || !selectedFile || !session;
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  message(authMessage, "Memproses login...");

  const { data, error } = await db.auth.signInWithPassword({
    email: ownerEmail.value.trim(),
    password: ownerPassword.value
  });

  ownerPassword.value = "";

  if (error) {
    message(authMessage, "Login gagal: " + error.message, "error");
    return;
  }

  renderSession(data.session);
  message(authMessage, "Login berhasil.", "success");
});

logoutBtn.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();

  if (error) {
    message(authMessage, "Logout gagal: " + error.message, "error");
    return;
  }

  renderSession(null);
  message(authMessage, "Berhasil logout.");
});

db.auth.onAuthStateChange((_event, session) => {
  renderSession(session);
});

// 6. MENAMPILKAN FILE TERBARU
async function loadLatestFile() {
  const currentName = $("current-name");
  const currentDetails = $("current-details");

  downloadBtn.hidden = true;
  message(downloadMessage, "");
  currentName.textContent = "Memuat file...";
  currentDetails.textContent = "Memeriksa penyimpanan...";

  const { data, error } = await db
    .from("active_file")
    .select("file_name, storage_path, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    currentName.textContent = "Gagal memuat file";
    currentDetails.textContent = "Periksa konfigurasi Supabase.";
    message(downloadMessage, error.message, "error");
    return;
  }

  if (!data) {
    currentName.textContent = "Belum ada file";
    currentDetails.textContent = "File terbaru belum di-upload.";
    return;
  }

  currentName.textContent = data.file_name;
  currentDetails.textContent =
    "Diperbarui " +
    new Date(data.updated_at).toLocaleString("id-ID");

  const { data: urlData } = db.storage
    .from(BUCKET)
    .getPublicUrl(data.storage_path);

  downloadBtn.href = urlData.publicUrl;
  downloadBtn.download = data.file_name;
  downloadBtn.hidden = false;
}

refreshBtn.addEventListener("click", loadLatestFile);

// 7. UPLOAD DAN GANTI FILE LAMA
async function uploadLatestFile() {
  if (busy || !selectedFile) return;

  setBusy(true);

  let uploadedPath = null;

  try {
    const session = await getSession();

    if (!session) {
      throw new Error("Login sebagai pemilik terlebih dahulu.");
    }

    const file = selectedFile;
    const name = cleanName(file.name);

    message(uploadMessage, "Meng-upload file baru...");

    // Nama sementara menghindari bentrok nama file.
    const tempPath =
      "incoming/" + crypto.randomUUID() + "-" + name;

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(tempPath, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });

    if (uploadError) throw uploadError;
    uploadedPath = tempPath;

    /*
      PENTING:
      Penggantian file lama harus dilakukan melalui backend
      tepercaya atau RPC/transaksi database yang sudah diamankan.
      Jangan menghapus file lama sebelum perubahan metadata
      berhasil. Kode ini sengaja berhenti di sini sampai
      mekanisme penggantian atomik selesai dikonfigurasi.
    */

    message(
      uploadMessage,
      "Upload berhasil, tetapi file belum diaktifkan. " +
      "Konfigurasi penggantian aman belum selesai.",
      "error"
    );

  } catch (error) {
    message(uploadMessage, "Upload gagal: " + error.message, "error");

    // Bersihkan file sementara jika upload berhasil tetapi
    // langkah berikutnya gagal. Policy Storage harus mengizinkan
    // pemilik menghapus objek di folder incoming.
    if (uploadedPath) {
      const { error: cleanupError } = await db.storage
        .from(BUCKET)
        .remove([uploadedPath]);

      if (cleanupError) {
        console.error("Gagal membersihkan file sementara:", cleanupError);
      }
    }
  } finally {
    setBusy(false);
    await loadLatestFile();
    await updateOwnerUI();
  }
}

async function updateOwnerUI() {
  try {
    renderSession(await getSession());
  } catch (error) {
    renderSession(null);
    console.error(error);
  }
}

uploadBtn.addEventListener("click", uploadLatestFile);

// 8. INISIALISASI
async function init() {
  if (
    !SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_PUBLISHABLE_KEY === "PASTE_SB_PUBLISHABLE_KEY_DI_SINI"
  ) {
    message(
      uploadMessage,
      "Masukkan Publishable Key Supabase di script.js."
    );
  }

  if (ownerPanel) ownerPanel.hidden = false;

  await updateOwnerUI();
  await loadLatestFile();
}

init();
