/** シフトレバー。運転者が選んだ位置への切り替えを要求する */
class ShiftLever {
    private final Transmission transmission;

    ShiftLever(Transmission transmission) {
        this.transmission = transmission;
    }

    void request(char to, int speed) {
        char from = transmission.getPosition();
        boolean accepted = transmission.shiftTo(to, speed);
        String result = accepted ? "受付" : "拒否";
        System.out.println(from + "→" + to + " " + speed + "km/h " + result + " 現在" + transmission.getPosition());
    }
}
