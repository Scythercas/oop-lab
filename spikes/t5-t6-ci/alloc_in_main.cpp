// T5: 実行中の動的メモリ確保を検出できるか（期待: 異常終了）
#include <cstdio>
#include <memory>

int main()
{
    std::unique_ptr<int> p(new int(3));
    std::printf("%d\n", *p);
    return 0;
}
