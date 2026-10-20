#ifndef TEST_TOOL_H
#define TEST_TOOL_H

#include <iostream>

#include "transmission.h"

// 試験用の道具。工場の検査で、規則を確かめずにシフト位置を設定する
class TestTool {
public:
    explicit TestTool(Transmission& transmission) : transmission_(transmission) {}

    void force(char to, int speed)
    {
        const char from = transmission_.position;
        transmission_.position = to;
        std::cout << from << "→" << to << ' ' << speed << "km/h 試験設定 現在" << transmission_.position << '\n';
    }

private:
    Transmission& transmission_;
};

#endif
