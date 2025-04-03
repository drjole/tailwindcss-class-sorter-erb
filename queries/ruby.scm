(pair
  key: (hash_key_symbol) @key
  (#eq? @key "class")
  value: (string
    [
      (string_content) @string_content
      (_)
    ]*
  ) @class_value
)

(pair
  key: (hash_key_symbol) @key
  (#eq? @key "class")
  value: (array
    (string
      [
        (string_content) @string_content
        (_)
      ]*
    ) @class_value
  )
)
