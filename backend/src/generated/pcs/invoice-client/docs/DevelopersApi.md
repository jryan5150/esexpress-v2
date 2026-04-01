# DevelopersApi

All URIs are relative to *https://api-pcssoft.com/api/invoice*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**addInvoice**](DevelopersApi.md#addinvoice) | **POST** / | Adding an Invoice |
| [**deleteInvoice**](DevelopersApi.md#deleteinvoice) | **DELETE** /{invoiceId} | Deleting an Invoice |
| [**getInvoice**](DevelopersApi.md#getinvoice) | **GET** /{invoiceId} | Returning an Invoice |
| [**getInvoices**](DevelopersApi.md#getinvoices) | **GET** / | Returning Invoices |
| [**partialUpdateInvoice**](DevelopersApi.md#partialupdateinvoice) | **PATCH** /{invoiceId} | Partial Update of an Invoice |
| [**updateInvoice**](DevelopersApi.md#updateinvoice) | **PUT** /{invoiceId} | Updating the Invoice |



## addInvoice

> addInvoice(invoice)

Adding an Invoice

Adds an invoice using a POST request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/invoice-api';
import type { AddInvoiceRequest } from '@pcs/invoice-api';

async function example() {
  console.log("🚀 Testing @pcs/invoice-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // Invoice | Inventory items available to be added. (optional)
    invoice: ...,
  } satisfies AddInvoiceRequest;

  try {
    const data = await api.addInvoice(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **invoice** | [Invoice](Invoice.md) | Inventory items available to be added. | [Optional] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The invoice was created. |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteInvoice

> deleteInvoice(invoiceId)

Deleting an Invoice

Deletes an invoice using a DELETE request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/invoice-api';
import type { DeleteInvoiceRequest } from '@pcs/invoice-api';

async function example() {
  console.log("🚀 Testing @pcs/invoice-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // number
    invoiceId: 56,
  } satisfies DeleteInvoiceRequest;

  try {
    const data = await api.deleteInvoice(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **invoiceId** | `number` |  | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The invoice was deleted. |  -  |
| **400** | Bad input parameter or object invalid. |  -  |
| **404** | The invoice was not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getInvoice

> Invoice getInvoice(invoiceId)

Returning an Invoice

Returns an invoice using a GET request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/invoice-api';
import type { GetInvoiceRequest } from '@pcs/invoice-api';

async function example() {
  console.log("🚀 Testing @pcs/invoice-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // number
    invoiceId: 56,
  } satisfies GetInvoiceRequest;

  try {
    const data = await api.getInvoice(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **invoiceId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**Invoice**](Invoice.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | An invoice was returned. |  -  |
| **404** | No invoice was found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getInvoices

> Array&lt;GetInvoices200ResponseInner&gt; getInvoices(status, type, account, office, from, to)

Returning Invoices

Returns invoice records using a GET request and search parameters.  

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/invoice-api';
import type { GetInvoicesRequest } from '@pcs/invoice-api';

async function example() {
  console.log("🚀 Testing @pcs/invoice-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // Array<'open' | 'paid' | 'pastDue' | 'shortPaid'> | Invoice statuses. Use commas to separate if using multiple. (optional)
    status: ...,
    // Array<'a' | 'ts' | 'tg' | 'is' | 'ig'> | Invoice types. Use commas to separate if using mutliple. (optional)
    type: ...,
    // number | Account Number. (optional)
    account: 56,
    // Array<string> | Office ID.  Use commas to separate if using multiple. (optional)
    office: ...,
    // Date | From Transaction Date. (optional)
    from: 2013-10-20,
    // Date | To Transaction Date. (optional)
    to: 2013-10-20,
  } satisfies GetInvoicesRequest;

  try {
    const data = await api.getInvoices(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **status** | `open`, `paid`, `pastDue`, `shortPaid` | Invoice statuses. Use commas to separate if using multiple. | [Optional] [Enum: open, paid, pastDue, shortPaid] |
| **type** | `a`, `ts`, `tg`, `is`, `ig` | Invoice types. Use commas to separate if using mutliple. | [Optional] [Enum: a, ts, tg, is, ig] |
| **account** | `number` | Account Number. | [Optional] [Defaults to `undefined`] |
| **office** | `Array<string>` | Office ID.  Use commas to separate if using multiple. | [Optional] |
| **from** | `Date` | From Transaction Date. | [Optional] [Defaults to `undefined`] |
| **to** | `Date` | To Transaction Date. | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;GetInvoices200ResponseInner&gt;**](GetInvoices200ResponseInner.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Search filter returned an invoice(s). |  -  |
| **400** | Invalid input. |  -  |
| **404** | The resource was not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## partialUpdateInvoice

> partialUpdateInvoice(invoiceId, patchDocument)

Partial Update of an Invoice

Updating an invoice record using a PATCH request. 

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/invoice-api';
import type { PartialUpdateInvoiceRequest } from '@pcs/invoice-api';

async function example() {
  console.log("🚀 Testing @pcs/invoice-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // number
    invoiceId: 56,
    // Array<PatchDocument> | Inventory items available to be updated. (optional)
    patchDocument: ...,
  } satisfies PartialUpdateInvoiceRequest;

  try {
    const data = await api.partialUpdateInvoice(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **invoiceId** | `number` |  | [Defaults to `undefined`] |
| **patchDocument** | `Array<PatchDocument>` | Inventory items available to be updated. | [Optional] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **204** | The invoice record was updated. |  -  |
| **404** | The invoice record was not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateInvoice

> updateInvoice(invoiceId, invoice)

Updating the Invoice

Update an invoice using a PUT request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/invoice-api';
import type { UpdateInvoiceRequest } from '@pcs/invoice-api';

async function example() {
  console.log("🚀 Testing @pcs/invoice-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // number
    invoiceId: 56,
    // Invoice | Inventory items available to be updated. (optional)
    invoice: ...,
  } satisfies UpdateInvoiceRequest;

  try {
    const data = await api.updateInvoice(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **invoiceId** | `number` |  | [Defaults to `undefined`] |
| **invoice** | [Invoice](Invoice.md) | Inventory items available to be updated. | [Optional] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **204** | The invoice was updated. |  -  |
| **400** | Invalid input or object invalid. |  -  |
| **404** | The invoice was not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

