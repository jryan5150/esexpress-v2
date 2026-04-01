
# CommodityRate


## Properties

Name | Type
------------ | -------------
`id` | number
`commodityLocator` | [CommodityLocator](CommodityLocator.md)
`stockId` | string
`description` | string
`pieces` | number
`actualWeight` | number
`tariffWeight` | number
`asWeight` | number
`space` | number
`seats` | number
`value` | number
`measureCode` | string
`length` | number
`width` | number
`height` | number
`lengthInches` | number
`widthInches` | number
`heightInches` | number
`isStackable` | boolean
`isFloorLoad` | boolean
`notes` | string

## Example

```typescript
import type { CommodityRate } from '@pcs/load-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "commodityLocator": null,
  "stockId": null,
  "description": null,
  "pieces": null,
  "actualWeight": null,
  "tariffWeight": null,
  "asWeight": null,
  "space": null,
  "seats": null,
  "value": null,
  "measureCode": null,
  "length": null,
  "width": null,
  "height": null,
  "lengthInches": null,
  "widthInches": null,
  "heightInches": null,
  "isStackable": null,
  "isFloorLoad": null,
  "notes": null,
} satisfies CommodityRate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CommodityRate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


