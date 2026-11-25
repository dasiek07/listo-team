// Listo – aplikacja na Windows. Okno z interfejsem Listo, bez paska przeglądarki.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Nie udało się uruchomić Listo");
}
