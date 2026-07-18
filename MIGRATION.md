# Gulati Store POS — Migration Guide

Follow these simple steps to copy and run this POS and ledger billing system on any other laptop.

---

## Step 1: Install Node.js on the New Laptop
1. On the new laptop, open your web browser and navigate to **[nodejs.org](https://nodejs.org/)**.
2. Download and run the **LTS (Long Term Support)** installer.
3. Click "Next" through the setup prompts to finish the installation.

---

## Step 2: Copy the Project Folder
1. Plug a USB pen drive into your current development laptop.
2. Copy the entire project folder containing these files.
3. Paste it onto your USB drive.

### 📋 File Migration Checklist:
* **GULATISTORE.db**: Copy this file to transfer all your current products, sales logs, and customer khata accounts to the new laptop. (If you want a fresh start, delete this file; the server will automatically create a clean database on the new machine).
* **node_modules**: You do **not** need to copy this folder (if it is on your USB). It contains system packages that we will download fresh in Step 3.

---

## Step 3: Run the POS App on the New Laptop
1. Plug the USB drive into the new laptop.
2. Copy the project folder and paste it anywhere (e.g., in your **Documents** or on the **Desktop**).
3. Open **PowerShell** or **Command Prompt** on the new laptop.
4. Change directory (`cd`) to your pasted folder:
   ```powershell
   cd "C:\Users\username\Documents\grocery-store-tool"
   ```
   *(Replace the path above with the actual folder path on your new laptop)*
5. Run the package installer:
   ```powershell
   npm install
   ```
   *(This downloads express and sqlite3 in 15 seconds)*
6. Boot up your local server:
   ```powershell
   npm start
   ```
7. Open Google Chrome or Microsoft Edge and navigate to:
   **`http://localhost:3000`**

### 📱 Connecting Mobile Phones:
1. Ensure both the new laptop and your mobile phones are on the **same Wi-Fi network**.
2. Look at the open PowerShell window on the new laptop. It will print your new laptop's network IP address.
3. Open the browser on your phone and type in the printed address (e.g., `http://192.168.1.15:3000`).
4. Enter your security PIN to log in and sync!
