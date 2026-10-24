// В релизе не показывать консольное окно на Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lyrics_lib::run()
}
