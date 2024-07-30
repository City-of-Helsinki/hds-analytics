# HDS Analytics

## Description
Helsinki Design System analytics application to check where, what components and what other packages it's possibly used with.

## Features
The app goes through all City-of-Helsinki owned repos and scans for `hds-react` usage.
If found:
- Checks the latest commit date
- Check the listed package-versions
- Runs the component level analytics
- Runs deeper analysis going through pre-defined filetypes and searching for usage of `hds-*` and certain wanted functions and variables `getCriticalHdsRules`, `getCriticalHdsRulesSync` and `hdsStyles`.

And output them to json files.

## Installation
Needs Node version `v20.12.2` to function properly (might work with some other versions too, includes `.nvmrc` to ease up the process). Run `yarn install` and that's all you need.

## Configuration and usage
Only mandatory input needed is `GITHUB_TOKEN` either as env variable named `GITHUB_TOKEN` or in command line as `GITHUB_TOKEN=<your github token>`. You can also specify the scanned package versions by optionally giving `PACKAGES=<package names separated by comma>`

As an example:
`yarn start PACKAGES=react,vite,gatsby GITHUB_TOKEN=asduihasudhasdh`

After all is run the results are output as 3 separate json files prefixed with date in `./tmp_results` folder.

There's also a Github action that is ran periodically (1st day of every month at 00:00) which stores the results in `results` branch under `results` folder (https://github.com/City-of-Helsinki/hds-analytics/tree/results/results).

## Remark
This fetches and scans whatever the repos' default branches are set to.

## Contact
Updated by the HDS-crew :)
