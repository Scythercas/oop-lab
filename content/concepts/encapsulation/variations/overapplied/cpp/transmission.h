#ifndef TRANSMISSION_H
#define TRANSMISSION_H

// 変速機。シフト位置（P・R・N・D）を持つ
class Transmission {
public:
    char position() const { return position_; }
    void set_position(char value) { position_ = value; }

private:
    char position_ = 'P';
};

#endif
