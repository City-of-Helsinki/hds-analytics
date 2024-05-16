# HDS Analytics

## Description
Helsinki Design System analytics application to check where, what components and what other packages it's possibly used with.

## Features
The app goes through all City-of-Helsinki owned repos and scans for `hds-react` usage.
If found:
- Checks the latest commit date
- Check the listed package-versions
- Runs the component level analytics

And output them to json files.

## Installation
Needs Node version `v20.12.2` to function properly (might work with some other versions too, includes `.nvmrc` to ease up the process). Run `yarn install` and that's all you need.

## Configuration and usage
Only mandatory input needed is `GITHUB_TOKEN` either as env variable named `GITHUB_TOKEN` or in command line as `GITHUB_TOKEN=<your github token>`. You can also specify the scanned package versions by optionally giving `PACKAGES=<package names separated by comma>`

As an example:
`yarn start PACKAGES=react,vite,gatsby GITHUB_TOKEN=asduihasudhasdh`

After all is run the results are output as 3 separate json files prefixed with date in `./results` folder.

## Remark
This fetches and scans whatever the repos' default branches are set to.

## Contact
Updated by the HDS-crew :)
