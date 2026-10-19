#ifndef PARK_BUTTON_H
#define PARK_BUTTON_H

#include <iostream>

#include "transmission.h"

// P ボタン。押されると P への切り替えを要求する
class ParkButton {
public:
    explicit ParkButton(Transmission& transmission) : transmission_(transmission) {}

    void press(int speed)
    {
        const char from = transmission_.position();
        transmission_.set_position('P');
        std::cout << from << "→P " << speed << "km/h 受付 現在" << transmission_.position() << '\n';
    }

private:
    Transmission& transmission_;
};

#endif
