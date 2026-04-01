
# TruckLoadCarrierAssignment


## Properties

Name | Type
------------ | -------------
`referenceNumber` | string
`notes` | string
`driverName` | string
`trailerNumber` | string
`carrierLocator` | [CarrierLocator](CarrierLocator.md)
`lineHaulRate` | [LineHaulRate](LineHaulRate.md)
`miles` | number
`truckNumber` | string
`driverMobilePhone` | string
`contact` | string
`autoRespondNotifications` | [Array&lt;AutoRespondNotification&gt;](AutoRespondNotification.md)
`pickupDate` | Date
`pickupTimeIn` | Date
`pickupTimeOut` | Date
`deliveryDate` | Date
`deliveryTimeIn` | Date
`deliveryTimeOut` | Date

## Example

```typescript
import type { TruckLoadCarrierAssignment } from '@pcs/dispatch-api'

// TODO: Update the object below with actual values
const example = {
  "referenceNumber": null,
  "notes": null,
  "driverName": null,
  "trailerNumber": null,
  "carrierLocator": null,
  "lineHaulRate": null,
  "miles": null,
  "truckNumber": null,
  "driverMobilePhone": null,
  "contact": null,
  "autoRespondNotifications": null,
  "pickupDate": null,
  "pickupTimeIn": null,
  "pickupTimeOut": null,
  "deliveryDate": null,
  "deliveryTimeIn": null,
  "deliveryTimeOut": null,
} satisfies TruckLoadCarrierAssignment

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as TruckLoadCarrierAssignment
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


