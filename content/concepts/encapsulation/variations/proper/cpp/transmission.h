#ifndef TRANSMISSION_H
#define TRANSMISSION_H

// 変速機。シフト位置（P・R・N・D）を持ち、切り替えの規則を守る
class Transmission {
public:
    char position() const { return position_; }

    // 規則に合えば切り替えて true を、合わなければ切り替えずに false を返す（例外は使わない）
    [[nodiscard]] bool shift_to(char to, int speed)
    {
        // 走行中は R に入れない
        if (to == 'R' && speed != 0) {
            return false;
        }
        position_ = to;
        return true;
    }

private:
    char position_ = 'P';
};

#endif
