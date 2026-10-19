// 動的メモリ確保を検出するための置き換え（詳細設計書 §8.2）。
// すべての形の operator new / new[] を置き換え、呼ばれたら異常終了する。
// 静的なオブジェクトの初期化の中で確保した場合も検出できる（M0 の T5 で確認）。
#include <cstdio>
#include <cstdlib>
#include <new>

[[noreturn]] static void fail()
{
    std::fputs("動的メモリ確保を検出しました\n", stderr);
    std::abort();
}

void* operator new(std::size_t) { fail(); }
void* operator new[](std::size_t) { fail(); }
void* operator new(std::size_t, const std::nothrow_t&) noexcept { fail(); }
void* operator new[](std::size_t, const std::nothrow_t&) noexcept { fail(); }
void* operator new(std::size_t, std::align_val_t) { fail(); }
void* operator new[](std::size_t, std::align_val_t) { fail(); }
void* operator new(std::size_t, std::align_val_t, const std::nothrow_t&) noexcept { fail(); }
void* operator new[](std::size_t, std::align_val_t, const std::nothrow_t&) noexcept { fail(); }
