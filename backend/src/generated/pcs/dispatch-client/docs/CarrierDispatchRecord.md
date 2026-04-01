
# CarrierDispatchRecord


## Properties

Name | Type
------------ | -------------
`id` | number
`dotId` | string
`loadId` | number
`tripId` | number
`status` | string
`dropCus` | number
`dropRetDate` | Date
`dropRetTime` | Date
`dropDate` | Date
`dropTimeIn` | Date
`dropName` | string
`dropAddress` | string
`dropCity` | string
`dropState` | string
`dropZip` | string
`dropZone` | string
`driverPay` | number
`coDriverPay` | number
`payType` | string
`payCode` | string
`driverId` | number
`driverName` | string
`coDriverId` | number
`coDriverName` | string
`truckId` | number
`truckNumber` | string
`trailerId1` | number
`trailerNumber1` | string
`trailerId2` | number
`trailerNumber2` | string
`unitId` | number
`unitNumber` | string
`carrierId` | number
`carrierName` | string
`dispatchDate` | Date
`dispatchTime` | Date
`dispatchCode` | string
`miles` | number
`mainDispatchId` | number
`emptyMiles` | number
`payRate` | number
`emptyRate` | number
`paySource` | string
`payMatrixId` | number
`totalPay` | number
`dispatchHours` | number
`batchId` | number
`dropTrailer1` | number
`dropTrailer2` | number
`notes` | string
`pickupDate` | Date
`pickupTimeIn` | Date
`pickupTimeOut` | Date
`pickupName` | string
`pickupAddress` | string
`pickupCity` | string
`pickupState` | string
`pickupZip` | string
`pickupZone` | string
`pickupCustomer` | number
`dropTimeOut` | Date
`deliveryCus` | number
`deliveryDate` | Date
`deliveryTimeIn` | Date
`deliveryTimeOut` | Date
`deliveryName` | string
`deliveryAddress` | string
`deliveryCity` | string
`deliveryState` | string
`deliveryZip` | string
`deliveryZone` | string
`emptyPull` | number
`macroPointOrderId` | string
`autoDispatch` | number
`carrierRef` | string
`carrierContact` | string
`accSplitId` | number
`payUnits` | number
`inputDate` | Date
`inputTime` | Date
`inputUser` | string
`entityCode` | string
`fuelMatrixId` | number
`actualDateOrigin` | Date
`actualTimeInOrigin` | Date
`actualTimeOutOrigin` | Date
`actualDateDestination` | Date
`actualTimeInDestination` | Date
`actualTimeOutDestination` | Date
`autoSendSatellite` | number
`ownerId` | number
`trailerCharge` | number
`preloadTrailer1` | number
`preloadTrailer2` | number
`driverPayForeignCurrency` | number
`currencyCode` | string
`driverCellPhone` | string

## Example

```typescript
import type { CarrierDispatchRecord } from '@pcs/dispatch-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "dotId": null,
  "loadId": null,
  "tripId": null,
  "status": null,
  "dropCus": null,
  "dropRetDate": null,
  "dropRetTime": null,
  "dropDate": null,
  "dropTimeIn": null,
  "dropName": null,
  "dropAddress": null,
  "dropCity": null,
  "dropState": null,
  "dropZip": null,
  "dropZone": null,
  "driverPay": null,
  "coDriverPay": null,
  "payType": null,
  "payCode": null,
  "driverId": null,
  "driverName": null,
  "coDriverId": null,
  "coDriverName": null,
  "truckId": null,
  "truckNumber": null,
  "trailerId1": null,
  "trailerNumber1": null,
  "trailerId2": null,
  "trailerNumber2": null,
  "unitId": null,
  "unitNumber": null,
  "carrierId": null,
  "carrierName": null,
  "dispatchDate": null,
  "dispatchTime": null,
  "dispatchCode": null,
  "miles": null,
  "mainDispatchId": null,
  "emptyMiles": null,
  "payRate": null,
  "emptyRate": null,
  "paySource": null,
  "payMatrixId": null,
  "totalPay": null,
  "dispatchHours": null,
  "batchId": null,
  "dropTrailer1": null,
  "dropTrailer2": null,
  "notes": null,
  "pickupDate": null,
  "pickupTimeIn": null,
  "pickupTimeOut": null,
  "pickupName": null,
  "pickupAddress": null,
  "pickupCity": null,
  "pickupState": null,
  "pickupZip": null,
  "pickupZone": null,
  "pickupCustomer": null,
  "dropTimeOut": null,
  "deliveryCus": null,
  "deliveryDate": null,
  "deliveryTimeIn": null,
  "deliveryTimeOut": null,
  "deliveryName": null,
  "deliveryAddress": null,
  "deliveryCity": null,
  "deliveryState": null,
  "deliveryZip": null,
  "deliveryZone": null,
  "emptyPull": null,
  "macroPointOrderId": null,
  "autoDispatch": null,
  "carrierRef": null,
  "carrierContact": null,
  "accSplitId": null,
  "payUnits": null,
  "inputDate": null,
  "inputTime": null,
  "inputUser": null,
  "entityCode": null,
  "fuelMatrixId": null,
  "actualDateOrigin": null,
  "actualTimeInOrigin": null,
  "actualTimeOutOrigin": null,
  "actualDateDestination": null,
  "actualTimeInDestination": null,
  "actualTimeOutDestination": null,
  "autoSendSatellite": null,
  "ownerId": null,
  "trailerCharge": null,
  "preloadTrailer1": null,
  "preloadTrailer2": null,
  "driverPayForeignCurrency": null,
  "currencyCode": null,
  "driverCellPhone": null,
} satisfies CarrierDispatchRecord

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CarrierDispatchRecord
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


