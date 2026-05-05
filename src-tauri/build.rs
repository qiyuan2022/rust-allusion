use std::path::PathBuf;

fn main() {
    // 链接本地 libvips（Windows）
    let vips_path = std::env::var("VIPS_PATH")
        .unwrap_or_else(|_| r"D:\dev_tools\vips-dev-8.18".to_string());
    println!(r"cargo:rustc-link-search=native={}\lib", vips_path);
    println!("cargo:rustc-link-lib=dylib=libvips");
    println!("cargo:rustc-link-lib=dylib=libgobject-2.0");
    println!("cargo:rustc-env=VIPS_PATH={}", vips_path);

    // 将 vips DLL 复制到构建输出目录，确保运行时能找到
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    // OUT_DIR 类似 target\release\build\...\out，我们需要找到最终的可执行文件目录
    let profile = std::env::var("PROFILE").unwrap();
    let target_dir = out_dir
        .ancestors()
        .find(|p| p.ends_with(&profile))
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| out_dir.join("..").join("..").join("..").join(&profile));

    let vips_bin = PathBuf::from(&vips_path).join("bin");
    let vips_dlls_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("vips-dlls");

    // 优先使用项目内打包的 DLL，如果没有则从开发环境复制
    let src_dir = if vips_dlls_dir.join("libvips-42.dll").exists() {
        vips_dlls_dir
    } else {
        vips_bin
    };

    if let Ok(entries) = std::fs::read_dir(&src_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map(|e| e == "dll").unwrap_or(false) {
                let dest = target_dir.join(path.file_name().unwrap());
                if let Err(e) = std::fs::copy(&path, &dest) {
                    eprintln!("Warning: failed to copy {:?} to {:?}: {}", path, dest, e);
                }
            }
        }
    }

    tauri_build::build()
}
