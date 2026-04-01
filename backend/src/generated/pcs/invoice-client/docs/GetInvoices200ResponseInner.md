
# GetInvoices200ResponseInner


## Properties

Name | Type
------------ | -------------
`invoiceId` | number
`accountNumber` | string
`invoiceType` | string
`customerCode` | string
`totalAmount` | number
`balance` | number
`customerReference` | string
`dueDate` | Date
`postingDate` | Date
`invoiceDate` | Date
`notes` | string
`term` | [Term](Term.md)
`office` | [Office](Office.md)
`lines` | [Array&lt;InvoiceItem&gt;](InvoiceItem.md)

## Example

```typescript
import type { GetInvoices200ResponseInner } from '@pcs/invoice-api'

// TODO: Update the object below with actual values
const example = {
  "invoiceId": 100015,
  "accountNumber": null,
  "invoiceType": TS,
  "customerCode": null,
  "totalAmount": null,
  "balance": null,
  "customerReference": null,
  "dueDate": null,
  "postingDate": null,
  "invoiceDate": null,
  "notes": null,
  "term": null,
  "office": null,
  "lines": null,
} satisfies GetInvoices200ResponseInner

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GetInvoices200ResponseInner
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


