public class Main {
    public static void main(String[] args) {
        Transmission transmission = new Transmission();
        ShiftLever lever = new ShiftLever(transmission);
        ParkButton parkButton = new ParkButton(transmission);

        lever.request('N', 0, false);
        lever.request('D', 0, false);
        lever.request('D', 0, true);
        lever.request('R', 20, true);
        parkButton.press(0, true);
    }
}
