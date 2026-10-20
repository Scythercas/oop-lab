/** 変速機。シフト位置（P・R・N・D）を持ち、切り替えの規則を守る */
class Transmission {
    private char position = 'P';

    char getPosition() {
        return position;
    }

    /** 規則に合えば切り替えて true を、合わなければ切り替えずに false を返す */
    boolean shiftTo(char to, int speed) {
        // 走行中は R と P に入れない
        if ((to == 'R' || to == 'P') && speed != 0) {
            return false;
        }
        position = to;
        return true;
    }
}
