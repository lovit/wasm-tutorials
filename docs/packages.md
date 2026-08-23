# Pyodide 에 들어 있는 패키지

Pyodide 가 미리 WebAssembly 로 빌드해 배포하는 패키지 목록이다. 이 목록에 있으면 `micropip.install()` 한 줄로 바로 쓸 수 있다. 없어도 순수 파이썬 패키지라면 PyPI 에서 받아 설치할 수 있다. 그 판별법은 아래에 있다.

> 이 문서는 `mise run docs:packages` 가 락파일에서 만든다. 손으로 고치지 말자. 다음 릴리스에서 덮어쓰인다.

## 기준

| 항목       | 값                  |
| ---------- | ------------------- |
| Pyodide    | 314.0.5             |
| Python     | 3.14.2              |
| Emscripten | emscripten_5_0_3    |
| ABI 태그   | pyemscripten_2026_0 |
| 패키지 수  | 356개               |

크기는 wheel 파일 자체의 크기다. wheel 은 이미 zip 이라 전송할 때 더 줄지 않는다. 그래서 표의 숫자가 곧 내려받는 양이다. 의존성 열은 그 패키지가 함께 끌고 오는 패키지 수다. `scikit-learn` 처럼 `scipy` 를 끌고 오는 것은 실제 부담이 표의 숫자보다 훨씬 크다.

## 자주 쓰는 것부터

### 데이터 다루기

| 패키지       | 버전     | 크기    | 의존성 |
| ------------ | -------- | ------- | ------ |
| `numpy`      | 2.4.6    | 2.8 MB  | 0      |
| `pandas`     | 3.0.2    | 4.0 MB  | 3      |
| `polars`     | 1.33.1   | 17.4 MB | 0      |
| `pyarrow`    | 22.0.0   | 9.5 MB  | 3      |
| `duckdb`     | 1.5.1    | 8.2 MB  | 0      |
| `xarray`     | 2026.2.0 | 813 KB  | 3      |
| `zarr`       | 3.2.1    | 306 KB  | 6      |
| `sqlalchemy` | 2.0.48   | 1.9 MB  | 1      |

### 그림 그리기

| 패키지       | 버전   | 크기   | 의존성 |
| ------------ | ------ | ------ | ------ |
| `matplotlib` | 3.10.8 | 6.6 MB | 10     |
| `bokeh`      | 3.9.0  | 5.9 MB | 10     |
| `altair`     | 6.0.0  | 766 KB | 5      |
| `wordcloud`  | 1.9.6  | 128 KB | 1      |

### 기계학습

| 패키지         | 버전   | 크기    | 의존성 |
| -------------- | ------ | ------- | ------ |
| `scikit-learn` | 1.8.0  | 4.2 MB  | 3      |
| `scipy`        | 1.18.0 | 13.2 MB | 1      |
| `statsmodels`  | 0.14.6 | 7.5 MB  | 5      |
| `xgboost`      | 2.1.4  | 688 KB  | 3      |
| `lightgbm`     | 4.6.0  | 733 KB  | 3      |
| `sympy`        | 1.14.0 | 3.9 MB  | 1      |
| `networkx`     | 3.6.1  | 1.0 MB  | 4      |

### 이미지와 소리

| 패키지          | 버전      | 크기    | 의존성 |
| --------------- | --------- | ------- | ------ |
| `pillow`        | 12.2.0    | 1005 KB | 0      |
| `scikit-image`  | 0.25.2    | 9.0 MB  | 8      |
| `opencv-python` | 4.11.0.86 | 10.2 MB | 1      |
| `imageio`       | 2.37.3    | 305 KB  | 2      |
| `soundfile`     | 0.12.1    | 692 KB  | 2      |
| `pygame-ce`     | 2.5.7     | 1.5 MB  | 0      |

### 웹과 네트워크

| 패키지         | 버전    | 크기   | 의존성 |
| -------------- | ------- | ------ | ------ |
| `micropip`     | 0.11.1  | 109 KB | 0      |
| `requests`     | 2.33.1  | 62 KB  | 4      |
| `httpx`        | 0.28.1  | 74 KB  | 0      |
| `pyodide-http` | 0.2.2   | 9 KB   | 0      |
| `fastapi`      | 0.136.1 | 110 KB | 6      |
| `pydantic`     | 2.12.5  | 444 KB | 4      |
| `openai`       | 2.30.0  | 974 KB | 6      |

### 글자 다루기

| 패키지           | 버전      | 크기   | 의존성 |
| ---------------- | --------- | ------ | ------ |
| `regex`          | 2026.3.32 | 199 KB | 0      |
| `nltk`           | 3.9.4     | 1.2 MB | 1      |
| `pygments`       | 2.20.0    | 1.2 MB | 0      |
| `tiktoken`       | 0.12.0    | 537 KB | 2      |
| `beautifulsoup4` | 4.14.3    | 104 KB | 2      |
| `lxml`           | 6.0.2     | 1.6 MB | 0      |

## 그 밖

크기는 자주 쓰는 것만 쟀다. 나머지가 궁금하면 `mise run docs:packages` 의 GROUPS 에 이름을 넣으면 된다.

| 패키지                            | 버전               | 의존성 |
| --------------------------------- | ------------------ | ------ |
| `affine`                          | 2.4.0              | 0      |
| `affine-tests`                    | 2.4.0              | 1      |
| `aiohappyeyeballs`                | 2.6.1              | 0      |
| `aiohttp`                         | 3.13.5             | 8      |
| `aiohttp-tests`                   | 3.13.5             | 1      |
| `aiosignal`                       | 1.4.0              | 1      |
| `annotated-doc`                   | 0.0.4              | 0      |
| `annotated-types`                 | 0.7.0              | 0      |
| `annotated-types-tests`           | 0.7.0              | 1      |
| `anyio`                           | 4.13.0             | 2      |
| `argon2-cffi`                     | 23.1.0             | 1      |
| `argon2-cffi-bindings`            | 25.1.0             | 1      |
| `astropy`                         | 7.2.0              | 5      |
| `astropy-iers-data`               | 0.2026.4.1.15.5.49 | 0      |
| `astropy-iers-data-tests`         | 0.2026.4.1.15.5.49 | 1      |
| `asttokens`                       | 3.0.1              | 1      |
| `async-timeout`                   | 5.0.1              | 0      |
| `atomicwrites`                    | 1.4.1              | 0      |
| `attrs`                           | 26.1.0             | 1      |
| `audioop-lts`                     | 0.2.2              | 0      |
| `b2d`                             | 0.7.4              | 4      |
| `bcrypt`                          | 5.0.0              | 0      |
| `bilby-cython`                    | 0.5.4              | 1      |
| `bilby-cython-tests`              | 0.5.4              | 1      |
| `biopython`                       | 1.87               | 1      |
| `bitarray`                        | 3.8.1              | 0      |
| `bitarray-tests`                  | 3.8.1              | 1      |
| `bitstring`                       | 4.4.0              | 1      |
| `bleach`                          | 6.3.0              | 3      |
| `boost-histogram`                 | 1.7.1              | 1      |
| `bottleneck`                      | 1.6.0              | 1      |
| `brotli`                          | 1.2.0              | 0      |
| `cachetools`                      | 7.0.5              | 0      |
| `cartopy`                         | 0.25.0             | 5      |
| `cartopy-tests`                   | 0.25.0             | 1      |
| `casadi`                          | 3.7.2              | 1      |
| `cbor-diag`                       | 1.1.2              | 0      |
| `certifi`                         | 2026.4.22          | 0      |
| `cffi`                            | 2.0.0              | 1      |
| `cffi-example`                    | 0.1                | 1      |
| `cftime`                          | 1.6.5              | 1      |
| `charset-normalizer`              | 3.4.7              | 0      |
| `clarabel`                        | 0.11.1             | 2      |
| `click`                           | 8.3.1              | 0      |
| `cligj`                           | 0.7.2              | 1      |
| `clingo`                          | 5.8.0              | 1      |
| `cloudpickle`                     | 3.1.2              | 0      |
| `cmyt`                            | 2.0.2              | 4      |
| `cobs`                            | 1.2.2              | 0      |
| `colorspacious`                   | 1.1.2              | 1      |
| `contourpy`                       | 1.3.3              | 1      |
| `coolprop`                        | 7.2.0              | 2      |
| `coolprop-tests`                  | 7.2.0              | 1      |
| `coverage`                        | 7.13.5             | 0      |
| `crc32c`                          | 2.8                | 0      |
| `crcmod`                          | 1.7                | 0      |
| `cryptography`                    | 47.0.0             | 2      |
| `cssselect`                       | 1.4.0              | 0      |
| `cvxpy-base`                      | 1.8.2              | 3      |
| `cvxpy-base-tests`                | 1.8.2              | 1      |
| `cycler`                          | 0.12.1             | 1      |
| `cysignals`                       | 1.12.3             | 0      |
| `cytoolz`                         | 1.1.0              | 1      |
| `cytoolz-tests`                   | 1.1.0              | 1      |
| `decorator`                       | 5.2.1              | 0      |
| `demes`                           | 0.2.3              | 2      |
| `deprecated`                      | 1.3.1              | 1      |
| `deprecation`                     | 2.1.0              | 1      |
| `diskcache`                       | 5.6.3              | 0      |
| `distlib`                         | 0.4.0              | 0      |
| `distro`                          | 1.9.0              | 0      |
| `dnspython`                       | 2.8.0              | 0      |
| `docutils`                        | 0.22.4             | 0      |
| `donfig`                          | 0.8.1.post1        | 1      |
| `donfig-tests`                    | 0.8.1.post1        | 1      |
| `ewah-bool-utils`                 | 1.3.0              | 1      |
| `ewah-bool-utils-tests`           | 1.3.0              | 1      |
| `exceptiongroup`                  | 1.3.1              | 0      |
| `executing`                       | 2.2.1              | 0      |
| `fiona`                           | 1.10.1             | 6      |
| `fonttools`                       | 4.62.1             | 0      |
| `freesasa`                        | 2.2.1              | 0      |
| `frozenlist`                      | 1.8.0              | 0      |
| `fsspec`                          | 2026.3.0           | 0      |
| `fsspec-tests`                    | 2026.3.0           | 1      |
| `future`                          | 1.0.0              | 0      |
| `future-tests`                    | 1.0.0              | 1      |
| `galpy`                           | 1.11.2             | 6      |
| `geopandas`                       | 1.1.3              | 5      |
| `geopandas-tests`                 | 1.1.3              | 1      |
| `gmpy2`                           | 2.3.0              | 0      |
| `google-crc32c`                   | 1.8.0              | 0      |
| `h11`                             | 0.16.0             | 0      |
| `h3`                              | 4.4.2              | 0      |
| `h5py`                            | 3.13.0             | 2      |
| `h5py-tests`                      | 3.13.0             | 1      |
| `healpy`                          | 1.19.0             | 2      |
| `healpy-tests`                    | 1.19.0             | 1      |
| `highspy`                         | 1.13.1             | 1      |
| `html5lib`                        | 1.1                | 2      |
| `httpcore`                        | 1.0.9              | 2      |
| `idna`                            | 3.11               | 0      |
| `igraph`                          | 1.0.0              | 1      |
| `iminuit`                         | 2.30.1             | 1      |
| `iniconfig`                       | 2.3.0              | 0      |
| `inspice`                         | 1.7.0.5            | 8      |
| `ipython`                         | 9.12.0             | 11     |
| `ipython-tests`                   | 9.12.0             | 1      |
| `jedi`                            | 0.19.2             | 1      |
| `jedi-tests`                      | 0.19.2             | 1      |
| `jinja2`                          | 3.1.6              | 1      |
| `jiter`                           | 0.13.0             | 0      |
| `joblib`                          | 1.5.3              | 0      |
| `joblib-tests`                    | 1.5.3              | 1      |
| `jsonpatch`                       | 1.33               | 1      |
| `jsonpointer`                     | 3.1.1              | 0      |
| `jsonschema`                      | 4.26.0             | 4      |
| `jsonschema-specifications`       | 2025.9.1           | 1      |
| `jsonschema-specifications-tests` | 2025.9.1           | 1      |
| `jsonschema-tests`                | 4.26.0             | 1      |
| `kiwisolver`                      | 1.5.0              | 0      |
| `lakers-python`                   | 0.6.2              | 0      |
| `lazy-loader`                     | 0.5                | 0      |
| `lazy-object-proxy`               | 1.12.0             | 0      |
| `libblis`                         | 2.1                | 0      |
| `libcrc32c`                       | 1.1.0              | 0      |
| `libcst`                          | 1.8.6              | 1      |
| `libcst-tests`                    | 1.8.6              | 1      |
| `libgdal`                         | 3.8.3              | 1      |
| `libgeos`                         | 3.12.1             | 0      |
| `libhdf5`                         | 1.12.1             | 0      |
| `libheif`                         | 1.12.0             | 0      |
| `libngspice`                      | 46                 | 0      |
| `libopenblas`                     | 0.3.31             | 0      |
| `libproj`                         | 9.6.2              | 0      |
| `librt`                           | 0.8.1              | 0      |
| `libsuitesparse`                  | 5.11.0             | 1      |
| `libtaglib`                       | 2.1.1              | 0      |
| `logbook`                         | 1.9.2              | 1      |
| `lz4`                             | 4.4.5              | 0      |
| `markupsafe`                      | 3.0.3              | 0      |
| `matplotlib-inline`               | 0.2.1              | 1      |
| `matplotlib-tests`                | 3.10.8             | 1      |
| `memory-allocator`                | 0.2.0              | 0      |
| `ml-dtypes`                       | 0.5.4              | 1      |
| `mmh3`                            | 5.2.1              | 0      |
| `more-itertools`                  | 11.0.1             | 0      |
| `mpmath`                          | 1.4.1              | 0      |
| `mpmath-tests`                    | 1.4.1              | 1      |
| `msgpack`                         | 1.1.2              | 0      |
| `msgspec`                         | 0.20.0             | 0      |
| `msprime`                         | 1.4.1              | 5      |
| `multidict`                       | 6.7.1              | 0      |
| `munch`                           | 4.0.0              | 2      |
| `mypy`                            | 1.19.1             | 1      |
| `mypy-tests`                      | 1.19.1             | 1      |
| `mysqlclient`                     | 2.2.8              | 0      |
| `narwhals`                        | 2.18.1             | 0      |
| `ndindex`                         | 1.10.1             | 0      |
| `ndindex-tests`                   | 1.10.1             | 1      |
| `netcdf4`                         | 1.7.4              | 4      |
| `networkx-tests`                  | 3.6.1              | 1      |
| `newick`                          | 1.11.0             | 0      |
| `nh3`                             | 0.3.4              | 0      |
| `nlopt`                           | 2.9.1              | 1      |
| `nltk-tests`                      | 3.9.4              | 1      |
| `numcodecs`                       | 0.15.1             | 2      |
| `numcodecs-tests`                 | 0.15.1             | 1      |
| `numpy-tests`                     | 2.4.6              | 0      |
| `optlang`                         | 1.9.0              | 3      |
| `optlang-tests`                   | 1.9.0              | 1      |
| `orjson`                          | 3.11.8             | 0      |
| `packaging`                       | 26.1               | 0      |
| `pandas-tests`                    | 3.0.2              | 1      |
| `parso`                           | 0.8.6              | 0      |
| `patsy`                           | 1.0.2              | 2      |
| `patsy-tests`                     | 1.0.2              | 1      |
| `pcodec`                          | 1.0.1              | 1      |
| `peewee`                          | 4.0.4              | 0      |
| `peewee-tests`                    | 4.0.4              | 1      |
| `phispy`                          | 5.0.6              | 3      |
| `pi-heif`                         | 1.3.0              | 2      |
| `pillow-heif`                     | 1.3.0              | 2      |
| `pkgconfig`                       | 1.6.0              | 0      |
| `platformdirs`                    | 4.9.4              | 0      |
| `pluggy`                          | 1.6.0              | 0      |
| `ply`                             | 3.11               | 0      |
| `prompt-toolkit`                  | 3.0.52             | 1      |
| `propcache`                       | 0.4.1              | 0      |
| `protobuf`                        | 7.34.1             | 0      |
| `psycopg`                         | 3.3.4              | 1      |
| `psycopg-c`                       | 3.3.4              | 0      |
| `pure-eval`                       | 0.2.3              | 0      |
| `py`                              | 1.11.0             | 0      |
| `pyclipper`                       | 1.4.0              | 0      |
| `pycparser`                       | 3.0                | 0      |
| `pycryptodome`                    | 3.23.0             | 0      |
| `pycryptodome-tests`              | 3.23.0             | 1      |
| `pydantic-core`                   | 2.41.5             | 1      |
| `pydoc-data`                      | 1.0.0              | 0      |
| `pyerfa`                          | 2.0.1.5            | 1      |
| `pyerfa-tests`                    | 2.0.1.5            | 1      |
| `pyheif`                          | 0.8.0              | 1      |
| `pyiceberg`                       | 0.11.1             | 12     |
| `pyinstrument`                    | 5.1.2              | 0      |
| `pymongo`                         | 4.16.0             | 1      |
| `pymupdf`                         | 1.27.2.2           | 0      |
| `pynacl`                          | 1.6.2              | 1      |
| `pyodide-unix-timezones`          | 1.0.0              | 0      |
| `pyparsing`                       | 3.3.2              | 0      |
| `pyproj`                          | 3.7.2              | 1      |
| `pyroaring`                       | 1.0.4              | 0      |
| `pyrodigal`                       | 3.7.1              | 0      |
| `pyrodigal-tests`                 | 3.7.1              | 1      |
| `pyrsistent`                      | 0.20.0             | 0      |
| `pysam`                           | 0.23.0             | 0      |
| `pyshp`                           | 3.0.3              | 0      |
| `pytaglib`                        | 3.2.0              | 0      |
| `pytest`                          | 9.0.2              | 10     |
| `pytest-asyncio`                  | 0.25.3             | 1      |
| `pytest-benchmark`                | 4.0.0              | 0      |
| `pytest-httpx`                    | 0.36.0             | 3      |
| `python-calamine`                 | 0.6.2              | 1      |
| `python-dateutil`                 | 2.9.0.post0        | 1      |
| `python-flirt`                    | 0.9.10             | 0      |
| `python-sat`                      | 1.8.dev26          | 1      |
| `python-solvespace`               | 3.0.8              | 0      |
| `pytz`                            | 2026.1.post1       | 0      |
| `pywavelets`                      | 1.9.0              | 1      |
| `pywavelets-tests`                | 1.9.0              | 1      |
| `pyxirr`                          | 0.10.8             | 0      |
| `pyyaml`                          | 6.0.3              | 0      |
| `rasterio`                        | 1.5.0              | 6      |
| `rateslib`                        | 2.7.1              | 3      |
| `rebound`                         | 4.4.7              | 1      |
| `reboundx`                        | 4.4.1              | 2      |
| `referencing`                     | 0.37.0             | 3      |
| `referencing-tests`               | 0.37.0             | 1      |
| `regex-tests`                     | 2026.3.32          | 1      |
| `retrying`                        | 1.4.2              | 1      |
| `rich`                            | 14.3.3             | 0      |
| `rpds-py`                         | 0.30.0             | 0      |
| `ruamel-yaml`                     | 0.19.1             | 0      |
| `safetensors`                     | 0.7.0              | 1      |
| `scikit-image-tests`              | 0.25.2             | 1      |
| `scikit-learn-tests`              | 1.8.0              | 1      |
| `scipy-tests`                     | 1.18.0             | 1      |
| `screed`                          | 1.1.3              | 0      |
| `screed-tests`                    | 1.1.3              | 1      |
| `sentencepiece`                   | 0.2.1              | 0      |
| `setuptools`                      | 82.0.1             | 1      |
| `setuptools-tests`                | 82.0.1             | 1      |
| `shapely`                         | 2.1.2              | 1      |
| `shapely-tests`                   | 2.1.2              | 1      |
| `simplejson`                      | 3.20.2             | 0      |
| `simplejson-tests`                | 3.20.2             | 1      |
| `sisl`                            | 0.16.4             | 7      |
| `sisl-tests`                      | 0.16.4             | 1      |
| `six`                             | 1.17.0             | 0      |
| `smart-open`                      | 7.5.1              | 1      |
| `sniffio`                         | 1.3.1              | 0      |
| `sniffio-tests`                   | 1.3.1              | 1      |
| `sortedcontainers`                | 2.4.0              | 0      |
| `soupsieve`                       | 2.8.3              | 0      |
| `sourmash`                        | 4.8.14             | 8      |
| `soxr`                            | 0.5.0.post1        | 1      |
| `sparseqr`                        | 1.2                | 4      |
| `sqlalchemy-tests`                | 2.0.48             | 1      |
| `stack-data`                      | 0.6.3              | 3      |
| `starlette`                       | 1.0.0              | 0      |
| `strictyaml`                      | 1.7.3              | 1      |
| `svgwrite`                        | 1.4.3              | 0      |
| `swiglpk`                         | 5.0.13             | 0      |
| `sympy-tests`                     | 1.14.0             | 1      |
| `tblib`                           | 3.2.2              | 0      |
| `termcolor`                       | 3.3.0              | 0      |
| `texttable`                       | 1.7.0              | 0      |
| `texture2ddecoder`                | 1.0.6              | 0      |
| `threadpoolctl`                   | 3.6.0              | 0      |
| `tomli`                           | 2.4.1              | 0      |
| `tomli-w`                         | 1.2.0              | 0      |
| `toolz`                           | 1.1.0              | 0      |
| `toolz-tests`                     | 1.1.0              | 1      |
| `tqdm`                            | 4.67.3             | 0      |
| `traitlets`                       | 5.14.3             | 0      |
| `traitlets-tests`                 | 5.14.3             | 1      |
| `traits`                          | 7.1.0              | 0      |
| `traits-tests`                    | 7.1.0              | 1      |
| `tree-sitter`                     | 0.23.2             | 0      |
| `tree-sitter-go`                  | 0.23.3             | 1      |
| `tree-sitter-java`                | 0.23.4             | 1      |
| `tree-sitter-python`              | 0.23.4             | 1      |
| `tskit`                           | 1.0.2              | 3      |
| `typing-extensions`               | 4.15.0             | 0      |
| `typing-inspection`               | 0.4.2              | 0      |
| `tzdata`                          | 2025.3             | 0      |
| `ujson`                           | 5.12.0             | 0      |
| `uncertainties`                   | 3.2.3              | 1      |
| `unyt`                            | 3.1.0              | 3      |
| `unyt-tests`                      | 3.1.0              | 1      |
| `urllib3`                         | 2.6.3              | 0      |
| `vega-datasets`                   | 0.9.0              | 1      |
| `vega-datasets-tests`             | 0.9.0              | 1      |
| `vrplib`                          | 2.1.0              | 1      |
| `wcwidth`                         | 0.6.0              | 0      |
| `webencodings`                    | 0.5.1              | 0      |
| `wrapt`                           | 2.1.2              | 0      |
| `xarray-tests`                    | 2026.2.0           | 1      |
| `xlrd`                            | 2.0.2              | 0      |
| `xxhash`                          | 3.6.0              | 0      |
| `xyzservices`                     | 2026.3.0           | 0      |
| `xyzservices-tests`               | 2026.3.0           | 1      |
| `yarl`                            | 1.23.0             | 3      |
| `yt`                              | 4.4.0              | 12     |
| `zarr-tests`                      | 3.2.1              | 1      |
| `zengl`                           | 2.7.2              | 0      |
| `zfpy`                            | 1.0.1              | 1      |
| `zstandard`                       | 0.25.0             | 1      |

## 목록에 없는 패키지 쓰기

락파일에 없어도 **순수 파이썬 패키지**라면 `micropip` 이 PyPI 에서 받아 설치한다. PyPI 는 CORS 를 허용하므로 브라우저에서 바로 내려받힌다.

```python
import micropip
await micropip.install("plotly")
```

되는지 판별하는 법은 간단하다. PyPI 의 그 패키지 "Download files" 탭을 열어 `*-py3-none-any.whl` 이 있는지 본다.

| 파일 이름 | 뜻 | Pyodide 에서 |
| --- | --- | --- |
| `foo-1.0-py3-none-any.whl` | 순수 파이썬 | `micropip` 으로 설치된다 |
| `foo-1.0-cp314-cp314-manylinux_x86_64.whl` | 리눅스용 네이티브 확장 | 안 된다. 아키텍처가 다르다 |
| `foo-1.0-cp314-cp314-pyodide_2026_0_wasm32.whl` | Pyodide 용으로 빌드된 것 | 된다 |

세 번째 줄이 PEP 783 이 만든 변화다. 예전에는 Pyodide 팀이 패키지를 직접 빌드해 배포해야 했지만, 이제는 패키지를 만든 사람이 PyPI 에 Pyodide 용 wheel 을 직접 올릴 수 있다.

## 안 되는 것과 그 이유

| 패키지 | 왜 안 되나 |
| --- | --- |
| `konlpy` | wheel 은 순수 파이썬이지만 안에서 JVM 을 부른다. 브라우저에 JVM 이 없다 |
| `kiwipiepy` | C++ 확장이다. Pyodide 용 wheel 이 아직 없다 |
| `psycopg`, `mysqlclient` | TCP 소켓이 필요하다. 브라우저는 소켓을 열 수 없다 |
| `multiprocessing` 을 쓰는 것 | 프로세스를 만들 수 없다. `threading` 도 마찬가지다 |

정리하면 걸리는 이유는 셋 중 하나다. 네이티브 확장이 Pyodide 용으로 빌드되지 않았거나, 브라우저에 없는 것(소켓, 스레드, 프로세스, JVM)을 쓰거나, 파일시스템을 진짜라고 가정하거나. 자세한 것은 [원리 문서](tutorials/README.md)에 있다.
