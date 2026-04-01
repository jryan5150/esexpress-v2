
# TruckLoadAssignment


## Properties

Name | Type
------------ | -------------
`notes` | string
`lineHaulRate` | [LineHaulRate](LineHaulRate.md)
`hours` | number
`coDriverLineHaulRate` | [LineHaulRate](LineHaulRate.md)
`coDriverHours` | number
`miles` | number
`coDriverMiles` | number
`driverLocator` | [DriverLocator](DriverLocator.md)
`coDriverLocator` | [DriverLocator](DriverLocator.md)
`truckLocator` | [TruckLocator](TruckLocator.md)
`trailer1Locator` | [TrailerLocator](TrailerLocator.md)
`trailer2Locator` | [TrailerLocator](TrailerLocator.md)
`unitLocator` | [UnitLocator](UnitLocator.md)
`autoRespondNotifications` | [Array&lt;AutoRespondNotification&gt;](AutoRespondNotification.md)
`pickupDate` | Date
`pickupTimeIn` | Date
`pickupTimeOut` | Date
`deliveryDate` | Date
`deliveryTimeIn` | Date
`deliveryTimeOut` | Date

## Example

```typescript
import type { TruckLoadAssignment } from '@pcs/dispatch-api'

// TODO: Update the object below with actual values
const example = {
  "notes": null,
  "lineHaulRate": null,
  "hours": null,
  "coDriverLineHaulRate": null,
  "coDriverHours": null,
  "miles": null,
  "coDriverMiles": null,
  "driverLocator": null,
  "coDriverLocator": null,
  "truckLocator": null,
  "trailer1Locator": null,
  "trailer2Locator": null,
  "unitLocator": null,
  "autoRespondNotifications": null,
  "pickupDate": null,
  "pickupTimeIn": null,
  "pickupTimeOut": null,
  "deliveryDate": null,
  "deliveryTimeIn": null,
  "deliveryTimeOut": null,
} satisfies TruckLoadAssignment

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as TruckLoadAssignment
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


