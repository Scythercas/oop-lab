/** シフトレバー。運転者が選んだ位置への切り替えを要求する */
class ShiftLever {
    private final Transmission transmission;

    ShiftLever(Transmission transmission) {
        this.transmission = transmission;
    }

    void request(char to, int speed) {
        char from = transmission.position;
        // 走行中は R に入れない
        if (to == 'R' && speed != 0) {
            System.out.println(from + "→" + to + " " + speed + "km/h 拒否 現在" + transmission.position);
            return;
        }
        transmission.position = to;
        System.out.println(from + "→" + to + " " + speed + "km/h 受付 現在" + transmission.position);
    }
}
