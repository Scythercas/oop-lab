/** 変速機。シフト位置（P・R・N・D）を持つ */
class Transmission {
    private char position = 'P';

    char getPosition() {
        return position;
    }

    void setPosition(char position) {
        this.position = position;
    }
}
