(pair
  key: (hash_key_symbol) @key
  (#eq? @key "class")
  value: (string) @class_value
)

(pair
  key: (hash_key_symbol) @key
  (#eq? @key "class")
  value: (array
    (string) @class_value
  )
)
