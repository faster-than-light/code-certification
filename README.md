# Code Quality Certification API Server

## Documentation


### Headers

**`FTL-SID`** *(required)* - BugCatcher Token to be used with the BugCatcher API server. 


### Endpoints

**`GET /token/:user`** 
Returns freshest saved token for user.

**`PUT /token/:user`** 
Saves the value of the `FTL-SID` found in the request headers.

