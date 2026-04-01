# DevelopersApi

All URIs are relative to *https://api.pcssoft.com/api/load*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**addLoad**](DevelopersApi.md#addloadoperation) | **POST** / | Adding a Load |
| [**cancelLoad**](DevelopersApi.md#cancelload) | **DELETE** /{loadId} | Cancelling a Load |
| [**getLoad**](DevelopersApi.md#getload) | **GET** /{loadId} | Returning a Load |
| [**getLoads**](DevelopersApi.md#getloads) | **GET** / | Returning Loads |
| [**partialUpdateLoad**](DevelopersApi.md#partialupdateload) | **PATCH** /{loadId} | Partial Update of a Load |
| [**updateLoad**](DevelopersApi.md#updateloadoperation) | **PUT** /{loadId} | Updating a Load |



## addLoad

> AddLoad200Response addLoad(addLoadRequest)

Adding a Load

Adds a load record using a POST request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/load-api';
import type { AddLoadOperationRequest } from '@pcs/load-api';

async function example() {
  console.log("🚀 Testing @pcs/load-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // AddLoadRequest | Load record to add.
    addLoadRequest: ...,
  } satisfies AddLoadOperationRequest;

  try {
    const data = await api.addLoad(body);
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
| **addLoadRequest** | [AddLoadRequest](AddLoadRequest.md) | Load record to add. | |

### Return type

[**AddLoad200Response**](AddLoad200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The load record was created. |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## cancelLoad

> cancelLoad(loadId)

Cancelling a Load

Cancels a load using a DELETE request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/load-api';
import type { CancelLoadRequest } from '@pcs/load-api';

async function example() {
  console.log("🚀 Testing @pcs/load-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // number
    loadId: 56,
  } satisfies CancelLoadRequest;

  try {
    const data = await api.cancelLoad(body);
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
| **loadId** | `number` |  | [Defaults to `undefined`] |

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
| **200** | The load record was cancelled. |  -  |
| **400** | The load cannot be cancelled due to it\&#39;s status. |  -  |
| **404** | The resource was not found. |  -  |
| **500** | Server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getLoad

> GetLoad200Response getLoad(loadId, localtime)

Returning a Load

Returns a load record using a GET request. 

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/load-api';
import type { GetLoadRequest } from '@pcs/load-api';

async function example() {
  console.log("🚀 Testing @pcs/load-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // number
    loadId: 56,
    // boolean | Use UTC or local time. (optional)
    localtime: true,
  } satisfies GetLoadRequest;

  try {
    const data = await api.getLoad(body);
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
| **loadId** | `number` |  | [Defaults to `undefined`] |
| **localtime** | `boolean` | Use UTC or local time. | [Optional] [Defaults to `undefined`] |

### Return type

[**GetLoad200Response**](GetLoad200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The load record(s) was returned. |  -  |
| **404** | The load record was not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getLoads

> Array&lt;GetLoads200ResponseInner&gt; getLoads(status, type, from, to, localtime, includestops, includerating)

Returning Loads

Returns load records using a GET request and search parameters.  

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/load-api';
import type { GetLoadsRequest } from '@pcs/load-api';

async function example() {
  console.log("🚀 Testing @pcs/load-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // Array<'active' | 'arrived' | 'assigned' | 'booked' | 'brokered' | 'cancelled' | 'dispatched' | 'dropped' | 'enroute' | 'moving' | 'pending' | 'possible' | 'ready'> | Load statuses. Use commas to separate if using multiple. (optional)
    status: ...,
    // Array<'tl' | 'ltl' | 'intermodal'> | Load types. Use commas to separate if using mutliple. (optional)
    type: ...,
    // Date | From DateReceived. (optional)
    from: 2013-10-20,
    // Date | To DateReceived. (optional)
    to: 2013-10-20,
    // boolean | Use UTC or local time. (optional)
    localtime: true,
    // boolean | Include stops in the load results. (optional)
    includestops: true,
    // boolean | Include rating in the load results. When this option is set, a required date range of at most 30 days is required. (optional)
    includerating: true,
  } satisfies GetLoadsRequest;

  try {
    const data = await api.getLoads(body);
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
| **status** | `active`, `arrived`, `assigned`, `booked`, `brokered`, `cancelled`, `dispatched`, `dropped`, `enroute`, `moving`, `pending`, `possible`, `ready` | Load statuses. Use commas to separate if using multiple. | [Optional] [Enum: active, arrived, assigned, booked, brokered, cancelled, dispatched, dropped, enroute, moving, pending, possible, ready] |
| **type** | `tl`, `ltl`, `intermodal` | Load types. Use commas to separate if using mutliple. | [Optional] [Enum: tl, ltl, intermodal] |
| **from** | `Date` | From DateReceived. | [Optional] [Defaults to `undefined`] |
| **to** | `Date` | To DateReceived. | [Optional] [Defaults to `undefined`] |
| **localtime** | `boolean` | Use UTC or local time. | [Optional] [Defaults to `undefined`] |
| **includestops** | `boolean` | Include stops in the load results. | [Optional] [Defaults to `undefined`] |
| **includerating** | `boolean` | Include rating in the load results. When this option is set, a required date range of at most 30 days is required. | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;GetLoads200ResponseInner&gt;**](GetLoads200ResponseInner.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Search filter returned a load(s). |  -  |
| **400** | Invalid input. |  -  |
| **404** | The resource was not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## partialUpdateLoad

> partialUpdateLoad(loadId, patchDocument)

Partial Update of a Load

Updating a load record using a PATCH request. 

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/load-api';
import type { PartialUpdateLoadRequest } from '@pcs/load-api';

async function example() {
  console.log("🚀 Testing @pcs/load-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // number
    loadId: 56,
    // Array<PatchDocument> | Inventory items available to be updated. (optional)
    patchDocument: ...,
  } satisfies PartialUpdateLoadRequest;

  try {
    const data = await api.partialUpdateLoad(body);
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
| **loadId** | `number` |  | [Defaults to `undefined`] |
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
| **204** | The load record was updated. |  -  |
| **404** | The load record was not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateLoad

> UpdateLoad200Response updateLoad(loadId, updateLoadRequest)

Updating a Load

Updates a load record using a PUT request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/load-api';
import type { UpdateLoadOperationRequest } from '@pcs/load-api';

async function example() {
  console.log("🚀 Testing @pcs/load-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // number
    loadId: 56,
    // UpdateLoadRequest | Updating a load record.
    updateLoadRequest: ...,
  } satisfies UpdateLoadOperationRequest;

  try {
    const data = await api.updateLoad(body);
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
| **loadId** | `number` |  | [Defaults to `undefined`] |
| **updateLoadRequest** | [UpdateLoadRequest](UpdateLoadRequest.md) | Updating a load record. | |

### Return type

[**UpdateLoad200Response**](UpdateLoad200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The load record was updated. |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

