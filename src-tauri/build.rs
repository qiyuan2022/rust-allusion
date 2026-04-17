fn main() {
    // 链接本地 libvips（Windows）
    let vips_path = std::env::var("VIPS_PATH")
        .unwrap_or_else(|_| r"D:\dev_tools\vips-dev-8.18".to_string());
    println!(r"cargo:rustc-link-search=native={}\lib", vips_path);
    println!("cargo:rustc-link-lib=dylib=libvips");
    println!("cargo:rustc-link-lib=dylib=libgobject-2.0");
    println!("cargo:rustc-env=VIPS_PATH={}", vips_path);

    tauri_build::build()
}
