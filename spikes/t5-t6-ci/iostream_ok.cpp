// T5: iostream の出力が alloc_guard に検出されないか（期待: 正常終了）
#include <array>
#include <iostream>

class Tire {
public:
    Tire(const char* position, int pressure) : position_(position), pressure_(pressure) {}
    void describe() const { std::cout << position_ << " " << pressure_ << "kPa" << '\n'; }

private:
    const char* position_;
    int pressure_;
};

static Tire frontLeft("左前", 230);

int main()
{
    std::array<const Tire*, 1> tires{&frontLeft};
    for (const Tire* t : tires) {
        t->describe();
    }
    std::cout << "合計 " << 1 + 2 << std::endl;
    return 0;
}
