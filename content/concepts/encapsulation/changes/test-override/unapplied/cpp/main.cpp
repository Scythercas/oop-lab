#include "park_button.h"
#include "shift_lever.h"
#include "test_tool.h"
#include "transmission.h"

int main()
{
    Transmission transmission;
    ShiftLever lever(transmission);
    ParkButton park_button(transmission);
    TestTool test_tool(transmission);

    lever.request('D', 0);
    lever.request('R', 20);
    lever.request('N', 15);
    park_button.press(15);
    lever.request('D', 0);
    lever.request('P', 5);
    test_tool.force('R', 30);
    return 0;
}
