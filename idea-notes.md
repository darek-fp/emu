# EMU parking manager - MVP

## Main problem
Effective management of parking spaces, consisting of:
- determining the current number of available spots
- determining spot availability for a requested future time period
- recording reservations

## Minimum feature set
- defining the parking lot structure — single or divided into sectors, specifying the number of spots overall or per sector
- recording reservations for a specified period with availability control for that period
- during reservation, there should be an option to provide the arrival and departure time
- defining a pricing schedule with the option: the longer the reservation, the lower the price per subsequent day, with a minimum price-per-day floor
- manual confirmation of vehicle arrival and departure
- manual confirmation of parking payment
- one type of user — parking lot managers
- simple user account system

## Out of scope for MVP
- customer accounts
- direct spot reservations by customers
- optimization of parking zone selection based on length of stay
- additional discounts for regular customers
- traffic congestion warnings based on declared arrival and departure times
- automatic vehicle arrival and departure detection (integration with camera and license plate recognition system)
- mobile app (web only at first)

## Success criteria
- a working application