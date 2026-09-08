// 콘솔 창이 뜨지 않게 합니다. 재부팅 자동 실행 때도 터미널이 열리지 않습니다.
#![windows_subsystem = "windows"]

fn main() {
  app_lib::run();
}
