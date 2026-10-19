#ifndef SHIFT_LEVER_H
#define SHIFT_LEVER_H

#include <iostream>

#include "transmission.h"

// シフトレバー。運転者が選んだ位置への切り替えを要求する
class ShiftLever {
public:
    explicit ShiftLever(Transmission& transmission) : transmission_(transmission) {}

    void request(char to, int speed)
    {
        const char from = transmission_.position();
        const bool accepted = transmission_.shift_to(to, speed);
        std::cout << from << "→" << to << ' ' << speed << "km/h " << (accepted ? "受付" : "拒否")
                  << " 現在" << transmission_.position() << '\n';
    }

private:
    Transmission& transmission_;
};

#endif
