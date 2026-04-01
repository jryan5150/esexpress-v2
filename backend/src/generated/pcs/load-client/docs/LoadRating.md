
# LoadRating


## Properties

Name | Type
------------ | -------------
`lineHaulRate` | [LineHaulLoadRate](LineHaulLoadRate.md)
`accessorialRates` | [Array&lt;AccessorialRate&gt;](AccessorialRate.md)
`commodityRating` | [CommodityRating](CommodityRating.md)

## Example

```typescript
import type { LoadRating } from '@pcs/load-api'

// TODO: Update the object below with actual values
const example = {
  "lineHaulRate": null,
  "accessorialRates": null,
  "commodityRating": null,
} satisfies LoadRating

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as LoadRating
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


