// T5: 静的な初期化の中の動的メモリ確保を検出できるか（期待: 異常終了）
#include <cstdio>
#include <vector>

static std::vector<int> values(10, 1);

int main()
{
    std::printf("%zu\n", values.size());
    return 0;
}
