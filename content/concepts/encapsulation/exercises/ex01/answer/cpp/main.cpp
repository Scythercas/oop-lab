#include "park_button.h"
#include "shift_lever.h"
#include "transmission.h"

int main()
{
    Transmission transmission;
    ShiftLever lever(transmission);
    ParkButton park_button(transmission);

    lever.request('N', 0, false);
    lever.request('D', 0, false);
    lever.request('D', 0, true);
    lever.request('R', 20, true);
    park_button.press(0, true);
    return 0;
}
