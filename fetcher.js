function mergeHeaders(...headerInits) {
    let result = {}
    headerInits.forEach((init) => {
        new Headers(init).forEach((value, key) => {
            if (value === 'null' || value === 'undefined') {
                delete result[key]
            } else {
                result[key] = value
            }
        })
    })
    return result
}

export function fetcher(input, options = {}) {
    const defaultHeaders = { Authorization: `token ${GITHUB_TOKEN}` }
    const headers = mergeHeaders(defaultHeaders, options.headers)
    console.log('Fetching', input);
    return fetch(input, { ...options, headers })
}

