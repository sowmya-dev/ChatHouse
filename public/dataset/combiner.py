new_file = open('webtech/abusive-text-detector/public/dataset/naughtywords.txt','w+')

with open('webtech/abusive-text-detector/public/dataset/dirtywords.txt','r') as file:
    
    lines = file.readlines()
    for line in lines:
        cleaned_line = line.strip(':1,\n').strip("\"").strip(" ")
        new_file.write(cleaned_line)
        new_file.write('\n')
    new_file.close()    
    file.close()