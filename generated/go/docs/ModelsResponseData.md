# ModelsResponseData

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**Object** | Pointer to **string** |  | [optional] 
**Created** | Pointer to **int32** |  | [optional] 
**OwnedBy** | Pointer to **string** |  | [optional] 
**Permissions** | Pointer to **[]map[string]interface{}** |  | [optional] 
**Root** | Pointer to **string** |  | [optional] 
**Parent** | Pointer to **string** |  | [optional] 
**ContextWindow** | Pointer to [**ModelsResponseContextWindow**](ModelsResponseContextWindow.md) |  | [optional] 
**Capabilities** | Pointer to **[]string** |  | [optional] 
**RateLimit** | Pointer to [**ModelsResponseRateLimit**](ModelsResponseRateLimit.md) |  | [optional] 

## Methods

### NewModelsResponseData

`func NewModelsResponseData() *ModelsResponseData`

NewModelsResponseData instantiates a new ModelsResponseData object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewModelsResponseDataWithDefaults

`func NewModelsResponseDataWithDefaults() *ModelsResponseData`

NewModelsResponseDataWithDefaults instantiates a new ModelsResponseData object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *ModelsResponseData) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *ModelsResponseData) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *ModelsResponseData) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *ModelsResponseData) HasId() bool`

HasId returns a boolean if a field has been set.

### GetObject

`func (o *ModelsResponseData) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *ModelsResponseData) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *ModelsResponseData) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *ModelsResponseData) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetCreated

`func (o *ModelsResponseData) GetCreated() int32`

GetCreated returns the Created field if non-nil, zero value otherwise.

### GetCreatedOk

`func (o *ModelsResponseData) GetCreatedOk() (*int32, bool)`

GetCreatedOk returns a tuple with the Created field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreated

`func (o *ModelsResponseData) SetCreated(v int32)`

SetCreated sets Created field to given value.

### HasCreated

`func (o *ModelsResponseData) HasCreated() bool`

HasCreated returns a boolean if a field has been set.

### GetOwnedBy

`func (o *ModelsResponseData) GetOwnedBy() string`

GetOwnedBy returns the OwnedBy field if non-nil, zero value otherwise.

### GetOwnedByOk

`func (o *ModelsResponseData) GetOwnedByOk() (*string, bool)`

GetOwnedByOk returns a tuple with the OwnedBy field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOwnedBy

`func (o *ModelsResponseData) SetOwnedBy(v string)`

SetOwnedBy sets OwnedBy field to given value.

### HasOwnedBy

`func (o *ModelsResponseData) HasOwnedBy() bool`

HasOwnedBy returns a boolean if a field has been set.

### GetPermissions

`func (o *ModelsResponseData) GetPermissions() []map[string]interface{}`

GetPermissions returns the Permissions field if non-nil, zero value otherwise.

### GetPermissionsOk

`func (o *ModelsResponseData) GetPermissionsOk() (*[]map[string]interface{}, bool)`

GetPermissionsOk returns a tuple with the Permissions field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPermissions

`func (o *ModelsResponseData) SetPermissions(v []map[string]interface{})`

SetPermissions sets Permissions field to given value.

### HasPermissions

`func (o *ModelsResponseData) HasPermissions() bool`

HasPermissions returns a boolean if a field has been set.

### GetRoot

`func (o *ModelsResponseData) GetRoot() string`

GetRoot returns the Root field if non-nil, zero value otherwise.

### GetRootOk

`func (o *ModelsResponseData) GetRootOk() (*string, bool)`

GetRootOk returns a tuple with the Root field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRoot

`func (o *ModelsResponseData) SetRoot(v string)`

SetRoot sets Root field to given value.

### HasRoot

`func (o *ModelsResponseData) HasRoot() bool`

HasRoot returns a boolean if a field has been set.

### GetParent

`func (o *ModelsResponseData) GetParent() string`

GetParent returns the Parent field if non-nil, zero value otherwise.

### GetParentOk

`func (o *ModelsResponseData) GetParentOk() (*string, bool)`

GetParentOk returns a tuple with the Parent field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetParent

`func (o *ModelsResponseData) SetParent(v string)`

SetParent sets Parent field to given value.

### HasParent

`func (o *ModelsResponseData) HasParent() bool`

HasParent returns a boolean if a field has been set.

### GetContextWindow

`func (o *ModelsResponseData) GetContextWindow() ModelsResponseContextWindow`

GetContextWindow returns the ContextWindow field if non-nil, zero value otherwise.

### GetContextWindowOk

`func (o *ModelsResponseData) GetContextWindowOk() (*ModelsResponseContextWindow, bool)`

GetContextWindowOk returns a tuple with the ContextWindow field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContextWindow

`func (o *ModelsResponseData) SetContextWindow(v ModelsResponseContextWindow)`

SetContextWindow sets ContextWindow field to given value.

### HasContextWindow

`func (o *ModelsResponseData) HasContextWindow() bool`

HasContextWindow returns a boolean if a field has been set.

### GetCapabilities

`func (o *ModelsResponseData) GetCapabilities() []string`

GetCapabilities returns the Capabilities field if non-nil, zero value otherwise.

### GetCapabilitiesOk

`func (o *ModelsResponseData) GetCapabilitiesOk() (*[]string, bool)`

GetCapabilitiesOk returns a tuple with the Capabilities field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCapabilities

`func (o *ModelsResponseData) SetCapabilities(v []string)`

SetCapabilities sets Capabilities field to given value.

### HasCapabilities

`func (o *ModelsResponseData) HasCapabilities() bool`

HasCapabilities returns a boolean if a field has been set.

### GetRateLimit

`func (o *ModelsResponseData) GetRateLimit() ModelsResponseRateLimit`

GetRateLimit returns the RateLimit field if non-nil, zero value otherwise.

### GetRateLimitOk

`func (o *ModelsResponseData) GetRateLimitOk() (*ModelsResponseRateLimit, bool)`

GetRateLimitOk returns a tuple with the RateLimit field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRateLimit

`func (o *ModelsResponseData) SetRateLimit(v ModelsResponseRateLimit)`

SetRateLimit sets RateLimit field to given value.

### HasRateLimit

`func (o *ModelsResponseData) HasRateLimit() bool`

HasRateLimit returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


